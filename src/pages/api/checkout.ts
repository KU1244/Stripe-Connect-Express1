// src/pages/api/checkout/checkout.ts
// Create Checkout Session with destination charges (platform fee model)
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
    CreateCheckoutSessionSchema,
    type CreateCheckoutSessionInput,
} from "@/schemas/checkout";

// Extract first value from multi-value headers (e.g., idempotency-key)
const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow POST method
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Validate request body with Zod
    const parsed = CreateCheckoutSessionSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    }

    const input: CreateCheckoutSessionInput = parsed.data;

    try {
        // Step 1: Resolve seller's Stripe account ID
        let sellerAcct = input.stripeAccountId;
        if (!sellerAcct && input.userId) {
            const ca = await prisma.connectedAccount.findFirst({
                where: { userId: input.userId },
                select: { stripeAccountId: true },
            });
            if (!ca) return res.status(404).json({ error: "Connected account not found" });
            sellerAcct = ca.stripeAccountId;
        }

        // Step 2: Check if seller can receive payments
        const account = await stripe.accounts.retrieve(sellerAcct!);
        if (!account.charges_enabled) {
            return res.status(409).json({ error: "Seller account cannot receive payments yet" });
        }

        // Step 3: Calculate platform fee from price
        const price = await stripe.prices.retrieve(input.priceId);
        if (!price.unit_amount || !price.currency) {
            return res.status(422).json({ error: "Price missing amount or currency" });
        }
        const subtotal = price.unit_amount * input.quantity;
        const applicationFee = Math.floor(subtotal * (input.feePercent / 100));

        // Step 4: Build redirect URLs
        const base = process.env.NEXT_PUBLIC_APP_URL;
        if (!base && (!input.successUrl || !input.cancelUrl)) {
            return res
                .status(500)
                .json({ error: "Missing NEXT_PUBLIC_APP_URL or explicit redirect URLs" });
        }
        const successUrl = input.successUrl ?? `${base}/success?session_id={CHECKOUT_SESSION_ID}`;
        const cancelUrl = input.cancelUrl ?? `${base}/cancel`;

        // Step 5: Optional idempotency key from request header
        const idemKey = first(req.headers["idempotency-key"]);

        // Step 6: Create Checkout Session with destination charges
        const session = await stripe.checkout.sessions.create(
            {
                mode: "payment",
                line_items: [{ price: input.priceId, quantity: input.quantity }],
                success_url: successUrl,
                cancel_url: cancelUrl,
                payment_intent_data: {
                    application_fee_amount: applicationFee,
                    transfer_data: { destination: sellerAcct! },
                    metadata: {
                        // FIX: Empty string causes issues in webhook processing
                        buyerId: input.buyerId || "guest",
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

        // Step 7: Return hosted checkout URL (no secrets exposed)
        return res.status(201).json({ url: session.url, sessionId: session.id });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({ error: "Failed to create checkout session", message });
    }
}