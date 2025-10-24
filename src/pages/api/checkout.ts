// Create a Stripe Checkout Session with destination charges (Connect Express).
// - Validates input with Zod (no "any").
// - Resolves seller either by userId (DB lookup) or explicit acct_* id.
// - Computes platform fee and sets transfer_data.destination.
// - Supports idempotency via "Idempotency-Key" header.
// - Returns only the URL and session id (no secrets).

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
    CreateCheckoutSessionSchema,
    type CreateCheckoutSessionInput,
} from "@/schemas/checkout";

// Normalize multi-value headers (e.g., idempotency-key)
const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Method guard
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Validate request body
    const parsed = CreateCheckoutSessionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    }

    // Use the exported type alias so it is not "unused"
    const input: CreateCheckoutSessionInput = parsed.data;

    try {
        // 1) Resolve seller's Stripe account id (acct_***)
        let sellerAcct = input.stripeAccountId;
        if (!sellerAcct && input.userId) {
            const ca = await prisma.connectedAccount.findFirst({
                where: { userId: input.userId },
                select: { stripeAccountId: true },
            });
            if (!ca) return res.status(404).json({ error: "Connected account not found" });
            sellerAcct = ca.stripeAccountId;
        }

        // 2) Ensure the connected account is allowed to take charges
        const account = await stripe.accounts.retrieve(sellerAcct!);
        if (!account.charges_enabled) {
            return res.status(409).json({ error: "Connected account is not chargeable yet" });
        }

        // 3) Read Price to compute fee accurately
        const price = await stripe.prices.retrieve(input.priceId);
        if (!price.unit_amount || !price.currency) {
            return res.status(422).json({ error: "Unsupported price (missing amount/currency)" });
        }
        const subtotal = price.unit_amount * input.quantity;
        const applicationFee = Math.floor(subtotal * (input.feePercent / 100));

        // 4) Derive redirect URLs
        const base = process.env.NEXT_PUBLIC_APP_URL;
        if (!base && (!input.successUrl || !input.cancelUrl)) {
            return res
                .status(500)
                .json({ error: "Missing NEXT_PUBLIC_APP_URL or explicit redirect URLs" });
        }
        const successUrl = input.successUrl ?? `${base}/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = input.cancelUrl ?? `${base}/cancel`;

        // 5) Optional idempotency
        const idemKey = first(req.headers["idempotency-key"]);

        // 6) Create Checkout Session with destination/fee on the PaymentIntent
        const session = await stripe.checkout.sessions.create(
            {
                mode: "payment",
                line_items: [{ price: input.priceId, quantity: input.quantity }],
                success_url: successUrl,
                cancel_url: cancelUrl,
                payment_intent_data: {
                    application_fee_amount: applicationFee,
                    transfer_data: { destination: sellerAcct! },
                    // Store minimal audit info for later webhook processing
                    metadata: {
                        buyerId: input.buyerId ?? "",
                        sellerStripeAccountId: sellerAcct!,
                        platformFee: String(applicationFee),
                        quantity: String(input.quantity),
                        currency: price.currency,
                        unitAmount: String(price.unit_amount),
                    },
                },
            },
            idemKey ? { idempotencyKey: idemKey } : undefined
        );

        // 7) Respond with the hosted URL only (no secrets)
        return res.status(201).json({ url: session.url, sessionId: session.id });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({ error: "Failed to create checkout session", message });
    }
}
