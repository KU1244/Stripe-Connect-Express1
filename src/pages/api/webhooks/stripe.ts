// src/pages/api/webhooks/stripe.ts
// Stripe webhook handler with signature verification and idempotent processing
import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { toJson, toJsonOrUndefined } from "@/lib/json";

// Disable body parser to read raw request body for signature verification
export const config = { api: { bodyParser: false } } as const;
void config;

// Read raw request body into Buffer (required for Stripe signature check)
async function readBuffer(readable: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

// Safe wrapper for signature verification (no throw)
function constructEventSafe(
    buf: Buffer,
    sig: string,
    secret: string
): { ok: true; event: Stripe.Event } | { ok: false; message: string } {
    try {
        const event = stripe.webhooks.constructEvent(buf, sig, secret);
        return { ok: true, event };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid payload";
        return { ok: false, message };
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow POST method
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Check for signature header
    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") {
        return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    // Check for webhook secret in environment
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        return res.status(500).json({ error: "Missing STRIPE_WEBHOOK_SECRET" });
    }

    // Verify Stripe signature
    const buf = await readBuffer(req);
    const verified = constructEventSafe(buf, sig, secret);
    if (!verified.ok) {
        return res.status(400).json({ error: "Signature verification failed", message: verified.message });
    }
    const event = verified.event;

    // Prevent duplicate event processing (idempotency check)
    const seen = await prisma.webhookEvent.findUnique({ where: { stripeEventId: event.id } });
    if (seen) {
        return res.status(200).json({ received: true, duplicate: true });
    }

    // Persist event payload for audit trail and retry capability
    await prisma.webhookEvent.create({
        data: { stripeEventId: event.id, type: event.type, payload: toJson(event) },
    });

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                // Link Checkout Session ID to Order (if Order exists from payment_intent event)
                const session = event.data.object as Stripe.Checkout.Session;
                const piId =
                    typeof session.payment_intent === "string"
                        ? session.payment_intent
                        : session.payment_intent?.id;

                if (piId && session.id) {
                    await prisma.order
                        .update({
                            where: { paymentIntentId: piId },
                            data: { checkoutSessionId: session.id },
                        })
                        .catch(() => {
                            // Order may not exist yet (PaymentIntent event might come later)
                        });
                }
                break;
            }

            case "payment_intent.succeeded": {
                // Create or update Order record when payment completes
                const pi = event.data.object as Stripe.PaymentIntent;
                const amount = pi.amount_received ?? pi.amount ?? 0;
                const currency = (pi.currency ?? "usd").toUpperCase();

                // FIX: Handle "guest" buyerId properly
                const rawBuyerId = pi.metadata?.buyerId || null;
                const buyerId = rawBuyerId && rawBuyerId !== "guest" ? rawBuyerId : null;

                const sellerAcct = pi.metadata?.sellerStripeAccountId || "";
                const platformFee = Number(pi.metadata?.platformFee ?? "0");

                // Try to capture Transfer ID from Charge (may not exist yet - async)
                let transferId: string | undefined;
                const chargeId =
                    typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
                if (chargeId) {
                    const ch = await stripe.charges.retrieve(chargeId);
                    transferId =
                        typeof ch.transfer === "string"
                            ? ch.transfer
                            : ch.transfer?.id ?? undefined;
                }

                // Resolve ConnectedAccount ID (foreign key constraint)
                const seller = await prisma.connectedAccount.findUnique({
                    where: { stripeAccountId: sellerAcct },
                    select: { id: true },
                });
                if (!seller) break; // Skip if seller not found (data integrity)

                // Upsert Order (create or update based on PaymentIntent ID)
                await prisma.order.upsert({
                    where: { paymentIntentId: pi.id },
                    create: {
                        paymentIntentId: pi.id,
                        sellerAccountId: seller.id,
                        buyerId: buyerId ?? undefined,
                        amount,
                        platformFee,
                        currency,
                        transferId,
                        status: "paid",
                        metadata: toJson(pi.metadata ?? {}),
                    },
                    update: {
                        amount,
                        platformFee,
                        currency,
                        transferId,
                        status: "paid",
                        metadata: toJson(pi.metadata ?? {}),
                    },
                });
                break;
            }

            case "account.updated": {
                // Sync ConnectedAccount status when Stripe account changes
                const account = event.data.object as Stripe.Account;
                await prisma.connectedAccount
                    .update({
                        where: { stripeAccountId: account.id },
                        data: {
                            chargesEnabled: Boolean(account.charges_enabled),
                            payoutsEnabled: Boolean(account.payouts_enabled),
                            detailsSubmitted: Boolean(account.details_submitted),
                            onboardingCompletedAt: account.details_submitted ? new Date() : null,
                            country: account.country ?? null,
                            defaultCurrency: account.default_currency ?? null,
                            requirements: toJsonOrUndefined(account.requirements),
                            capabilities: toJsonOrUndefined(account.capabilities),
                        },
                    })
                    .catch(() => {
                        // Account might not exist in our DB yet (ignore error)
                    });
                break;
            }

            default:
                // Acknowledge other event types without processing
                break;
        }

        // Mark event as successfully processed
        await prisma.webhookEvent.update({
            where: { stripeEventId: event.id },
            data: { processedAt: new Date() },
        });

        return res.status(200).json({ received: true });
    } catch (e) {
        // Return 500 to trigger Stripe retry mechanism
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({ error: "Webhook processing failed", message });
    }
}