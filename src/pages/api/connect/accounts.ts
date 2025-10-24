import type { NextApiRequest, NextApiResponse } from "next";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { CreateConnectedAccountSchema } from "@/schemas/connect";

// Helper for JSON casting without using "any"
const toJson = <T,>(v: T): Prisma.InputJsonValue =>
    JSON.parse(JSON.stringify(v)) as unknown as Prisma.InputJsonValue;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const parsed = CreateConnectedAccountSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    }
    const { userId } = parsed.data;

    try {
        // Reuse if exists
        const existing = await prisma.connectedAccount.findFirst({ where: { userId } });
        if (existing) {
            return res.status(200).json({ stripeAccountId: existing.stripeAccountId, reused: true });
        }

        // Create Express connected account
        const account = await stripe.accounts.create({ type: "express" });

        // Persist (mirror useful flags/snapshots)
        await prisma.connectedAccount.create({
            data: {
                userId,
                stripeAccountId: account.id,
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

        return res.status(201).json({ stripeAccountId: account.id, reused: false });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({ error: "Failed to create connected account", message });
    }
}
