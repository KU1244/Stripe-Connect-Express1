import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

// Helper: normalize query param
const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

/**
 * Admin-oriented listing endpoint for Connected Accounts.
 * - Optional filters: ?userId=... or ?stripeAccountId=acct_...
 * - Returns connected accounts with minimal user info.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const userId = first(req.query.userId);
    const stripeAccountId = first(req.query.stripeAccountId);

    // Build WHERE clause against ConnectedAccount (not User)
    const where =
        stripeAccountId != null
            ? { stripeAccountId }
            : userId != null
                ? { userId }
                : {};

    try {
        const rows = await prisma.connectedAccount.findMany({
            where,
            include: {
                user: { select: { id: true, email: true, name: true } }, // minimal PII
            },
            orderBy: { createdAt: "desc" },
            take: 200, // avoid accidental huge responses
        });

        return res.status(200).json(
            rows.map(r => ({
                stripeAccountId: r.stripeAccountId,
                user: r.user,
                chargesEnabled: r.chargesEnabled,
                payoutsEnabled: r.payoutsEnabled,
                detailsSubmitted: r.detailsSubmitted,
                country: r.country,
                defaultCurrency: r.defaultCurrency,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            }))
        );
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return res.status(500).json({ error: "Failed to list connected accounts", message });
    }
}
