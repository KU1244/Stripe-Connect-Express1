import { PrismaClient } from "@prisma/client";

// Avoid creating multiple clients in dev (no 'any' used)
const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
    g.prisma = prisma;
}
