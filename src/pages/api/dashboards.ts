import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    const rows = await prisma.connectedAccount.findMany({
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: "desc" },
    });

    return res.status(200).json(rows);
}
