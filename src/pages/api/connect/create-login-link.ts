// src/pages/api/connect/create-login-link.ts
// POST /api/connect/create-login-link
// Generate Express Dashboard login link for connected account
import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { CreateLoginLinkSchema } from "@/schemas/connect";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow POST requests
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Validate request body
    const parsed = CreateLoginLinkSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            error: "Invalid body",
            issues: parsed.error.issues
        });
    }
    const { userId, stripeAccountId: rawAcct } = parsed.data;

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

        // Create login link (redirects to Express Dashboard)
        const link = await stripe.accounts.createLoginLink(stripeAccountId!);

        return res.status(201).json({ url: link.url });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({
            error: "Failed to create login link",
            message
        });
    }
}