// Stripe webhook endpoint (raw body, signature verification, idempotent processing)
// - Do NOT use body parser: we must verify the raw payload
// - No local throw/catch in the handler; use a non-throwing helper
// - Safe JSON storage (no `any`) and duplicate-event guard

import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { toJson, toJsonOrUndefined } from "@/lib/json";

export const config = { api: { bodyParser: false } } as const;
// Read-once so TS/ESLint don’t flag it as unused (no runtime effect)
void config;

// Read raw request body into a Buffer (needed for signature verification)
async function readBuffer(readable: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

// Non-throwing wrapper for signature verification.
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
    // Method guard
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Header & secret guards (no throw)
    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") {
        return res.status(400).json({ error: "Missing stripe-signature header" });
    }
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
        return res.status(500).json({ error: "Missing STRIPE_WEBHOOK_SECRET" });
    }

    // Verify signature via non-throwing helper
    const buf = await readBuffer(req);
    const verified = constructEventSafe(buf, sig, secret);
    if (!verified.ok) {
        return res.status(400).json({ error: "Signature verification failed", message: verified.message });
    }
    const event = verified.event;

    // Idempotency: skip if we've already processed this `evt_***`
    const seen = await prisma.webhookEvent.findUnique({ where: { stripeEventId: event.id } });
    if (seen) {
        return res.status(200).json({ received: true, duplicate: true });
    }

    // Persist the event payload safely (stringify→parse) for Prisma JSON type
    await prisma.webhookEvent.create({
        data: { stripeEventId: event.id, type: event.type, payload: toJson(event) },
    });

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                // Attach Checkout Session id to existing Order (found by PaymentIntent id)
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
                            // Order may not exist yet; safe to ignore (will be upserted on PI event)
                        });
                }
                break;
            }

            case "payment_intent.succeeded": {
                // Create/Update an Order row based on the PaymentIntent (idempotent via upsert)
                const pi = event.data.object as Stripe.PaymentIntent;
                const amount = pi.amount_received ?? pi.amount ?? 0;
                const currency = (pi.currency ?? "jpy").toUpperCase();
                const buyerId = pi.metadata?.buyerId || null;
                const sellerAcct = pi.metadata?.sellerStripeAccountId || "";
                const platformFee = Number(pi.metadata?.platformFee ?? "0");

                // Try to capture the transfer id from the charge (optional)
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

                // Resolve our ConnectedAccount row (FK)
                const seller = await prisma.connectedAccount.findUnique({
                    where: { stripeAccountId: sellerAcct },
                    select: { id: true },
                });
                if (!seller) break; // no FK → skip quietly

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
                const account = event.data.object as Stripe.Account;
                // Update by unique key (stripeAccountId); ignore if not found (first-time events)
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
                    .catch(() => {});
                break;
            }

            default:
                // Acknowledge other events without processing
                break;
        }

        // Mark as processed
        await prisma.webhookEvent.update({
            where: { stripeEventId: event.id },
            data: { processedAt: new Date() },
        });

        return res.status(200).json({ received: true });
    } catch (e) {
        // 500 to let Stripe retry on transient processing errors
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({ error: "Webhook processing failed", message });
    }
}
