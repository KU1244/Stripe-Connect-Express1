import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "node:stream";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const config = { api: { bodyParser: false } };

const toJson = <T,>(v: T): Prisma.InputJsonValue =>
    JSON.parse(JSON.stringify(v)) as unknown as Prisma.InputJsonValue;

async function readBuffer(readable: Readable): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const sig = req.headers["stripe-signature"];
    if (typeof sig !== "string") {
        return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    let event: Stripe.Event;
    try {
        const buf = await readBuffer(req);
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
        event = stripe.webhooks.constructEvent(buf, sig, secret);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid payload";
        return res.status(400).json({ error: "Signature verification failed", message });
    }

    // Idempotency guard
    const seen = await prisma.webhookEvent.findUnique({ where: { stripeEventId: event.id } });
    if (seen) return res.status(200).json({ received: true, duplicate: true });

    await prisma.webhookEvent.create({
        data: {
            stripeEventId: event.id,
            type: event.type,
            payload: toJson(event), // safe JSON without "any"
        },
    });

    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                const piId =
                    typeof session.payment_intent === "string"
                        ? session.payment_intent
                        : session.payment_intent?.id;

                if (piId && session.id) {
                    // Single-row update by unique key (safer than updateMany)
                    await prisma.order.update({ where: { paymentIntentId: piId }, data: { checkoutSessionId: session.id } })
                        .catch(() => { /* order may not exist yet; OK */ });
                }
                break;
            }

            case "payment_intent.succeeded": {
                const pi = event.data.object as Stripe.PaymentIntent;
                const amount = pi.amount_received ?? pi.amount ?? 0;
                const currency = (pi.currency ?? "jpy").toUpperCase();
                const buyerId = pi.metadata?.buyerId || null;
                const sellerAcct = pi.metadata?.sellerStripeAccountId || "";
                const platformFee = Number(pi.metadata?.platformFee ?? "0");

                // Transfer id from latest charge (optional)
                let transferId: string | null = null;
                const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
                if (chargeId) {
                    const ch = await stripe.charges.retrieve(chargeId);
                    transferId =
                        typeof ch.transfer === "string"
                            ? ch.transfer
                            : ch.transfer?.id ?? null;
                }

                // Resolve ConnectedAccount row
                const seller = await prisma.connectedAccount.findUnique({
                    where: { stripeAccountId: sellerAcct },
                    select: { id: true },
                });
                if (!seller) break; // cannot persist order without FK; ignore safely

                await prisma.order.upsert({
                    where: { paymentIntentId: pi.id },
                    create: {
                        paymentIntentId: pi.id,
                        sellerAccountId: seller.id,
                        buyerId: buyerId ?? undefined,
                        amount,
                        platformFee,
                        currency,
                        transferId: transferId ?? undefined,
                        status: "paid",
                        metadata: toJson(pi.metadata ?? {}),
                    },
                    update: {
                        amount,
                        platformFee,
                        currency,
                        transferId: transferId ?? undefined,
                        status: "paid",
                        metadata: toJson(pi.metadata ?? {}),
                    },
                });
                break;
            }

            case "account.updated": {
                const account = event.data.object as Stripe.Account;
                await prisma.connectedAccount.updateMany({
                    where: { stripeAccountId: account.id },
                    data: {
                        chargesEnabled: Boolean(account.charges_enabled),
                        payoutsEnabled: Boolean(account.payouts_enabled),
                        detailsSubmitted: Boolean(account.details_submitted),
                        onboardingCompletedAt: account.details_submitted ? new Date() : null,
                        country: account.country ?? null,
                        defaultCurrency: account.default_currency ?? null,
                        requirements: account.requirements ? toJson(account.requirements) : undefined,
                        capabilities: account.capabilities ? toJson(account.capabilities) : undefined,
                    },
                });
                break;
            }

            default:
                // acknowledge other events without processing
                break;
        }

        await prisma.webhookEvent.update({
            where: { stripeEventId: event.id },
            data: { processedAt: new Date() },
        });

        return res.status(200).json({ received: true });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        // 500 -> let Stripe retry
        return res.status(500).json({ error: "Webhook processing failed", message });
    }
}
