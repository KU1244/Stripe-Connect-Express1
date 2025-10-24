import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
    userId: z.string().min(1).optional(),
    stripeAccountId: z.string().min(1).optional(),
    amount: z.number().int().positive(),
    currency: z.string().length(3),
    buyerId: z.string().optional(),
    feePercent: z.number().min(0).max(100).default(10),
}).refine(d => d.userId || d.stripeAccountId, {
    message: "Either userId or stripeAccountId is required",
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    }
    const { userId, stripeAccountId: rawAcct, amount, currency, buyerId, feePercent } = parsed.data;

    try {
        let stripeAccountId = rawAcct;
        if (!stripeAccountId && userId) {
            const ca = await prisma.connectedAccount.findFirst({
                where: { userId },
                select: { stripeAccountId: true },
            });
            if (!ca) return res.status(404).json({ error: "Connected account not found" });
            stripeAccountId = ca.stripeAccountId;
        }

        const applicationFee = Math.floor(amount * (feePercent / 100));

        const pi = await stripe.paymentIntents.create({
            amount,
            currency,
            application_fee_amount: applicationFee,
            transfer_data: { destination: stripeAccountId! },
            metadata: {
                buyerId: buyerId ?? "",
                sellerStripeAccountId: stripeAccountId!,
                platformFee: String(applicationFee),
            },
        });

        return res.status(201).json({
            paymentIntentId: pi.id,
            clientSecret: pi.client_secret,
            amount,
            platformFee: applicationFee,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({ error: "Failed to create PaymentIntent", message });
    }
}
