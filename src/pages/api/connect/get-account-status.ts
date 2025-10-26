// src/pages/api/connect/get-account-status.ts
// GET /api/connect/get-account-status?userId=xxx
// Retrieve Stripe Connect account status and sync to database
import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";
import { GetAccountStatusSchema } from "@/schemas/connect";

// Extract first value from query params (handle array case)
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow GET requests
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Validate query parameters
    const parsed = GetAccountStatusSchema.safeParse({
        userId: first(req.query.userId),
        stripeAccountId: first(req.query.stripeAccountId),
    });
    if (!parsed.success) {
        return res.status(400).json({
            error: "Invalid query",
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

        // Fetch latest account status from Stripe
        const account = await stripe.accounts.retrieve(stripeAccountId!);

        // Sync account status to database (best-effort update)
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

        // Return simplified response for client
        return res.status(200).json({
            stripeAccountId: account.id,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            country: account.country ?? null,
            defaultCurrency: account.default_currency ?? null,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({
            error: "Failed to retrieve account",
            message
        });
    }
}