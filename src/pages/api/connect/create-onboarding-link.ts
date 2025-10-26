// src/pages/api/connect/create-onboarding-link.ts
// POST /api/connect/create-onboarding-link
// Generate Stripe onboarding link (AccountLink) for identity verification
import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { CreateAccountLinkSchema } from "@/schemas/connect";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow POST requests
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Validate request body
    const parsed = CreateAccountLinkSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: "Invalid body",
            issues: parsed.error.issues
        });
    }
    const { userId, stripeAccountId: rawAcct, refreshUrl, returnUrl } = parsed.data;

    try {
        // Resolve Stripe account ID (from userId or direct)
        let stripeAccountId = rawAcct;
        if (!stripeAccountId && userId) {
            const ca = await prisma.connectedAccount.findFirst({
                where: { userId },
                select: { stripeAccountId: true },
            });
            if (!ca) {
                return res.status(404).json({
                    error: "Connected account not found"
                });
            }
            stripeAccountId = ca.stripeAccountId;
        }

        // Create onboarding link (expires in ~5 minutes)
        const link = await stripe.accountLinks.create({
            account: stripeAccountId!,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: "account_onboarding",
        });

        return res.status(201).json({
            url: link.url,
            expiresAt: link.expires_at
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({
            error: "Failed to create account link",
            message
        });
    }
}