// Type-safe environment variable loader using Zod (no "any").
import { z } from "zod";

const schema = z.object({
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(), // required only for webhooks
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Invalid environment variables: ${msg}`);
}

export const env = parsed.data;
