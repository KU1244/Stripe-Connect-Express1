// src/pages/api/connect/list-accounts.ts
// GET /api/connect/list-accounts?userId=xxx
// List all connected accounts (admin/dashboard view)
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

// Extract first value from query params (handle array case)
const first = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow GET requests
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    // Optional filters from query params
    const userId = first(req.query.userId);
    const stripeAccountId = first(req.query.stripeAccountId);

    // Build WHERE clause
    const where =
        stripeAccountId != null
            ? { stripeAccountId }
            : userId != null
                ? { userId }
                : {};

    try {
        // Fetch connected accounts with user info
        const rows = await prisma.connectedAccount.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
            },
            orderBy: { createdAt: "desc" },
            take: 200, // Limit to prevent huge responses
        });

        // Return simplified response
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
        return res.status(500).json({
            error: "Failed to list connected accounts",
            message
        });
    }
}