// Zod schema for creating Checkout Sessions (destination charges).
// Notes:
// - One of userId or stripeAccountId (acct_***) must be provided
// - successUrl/cancelUrl use a custom absolute-URL validator to avoid deprecated .url()

import { z } from "zod";
import { AbsoluteUrlSchema } from "./common";

export const CreateCheckoutSessionSchema = z
    .object({
        // Identify the seller by your user id or by Stripe account id
        userId: z.string().min(1).optional(),
        stripeAccountId: z.string().min(1).optional(), // e.g., "acct_123"

        // Optional buyer id for your own records
        buyerId: z.string().min(1).optional(),

        // What to sell: Stripe Price id
        priceId: z.string().min(1),

        // Defaults tuned for typical single-item flows
        quantity: z.number().int().positive().max(99).optional().default(1),
        feePercent: z.number().min(0).max(100).optional().default(10),

        // Optional explicit redirect URLs; if absent, server will derive from NEXT_PUBLIC_APP_URL
        successUrl: AbsoluteUrlSchema.optional(),
        cancelUrl: AbsoluteUrlSchema.optional(),
    })
    .refine((d) => d.userId || d.stripeAccountId, {
        message: "Either userId or stripeAccountId is required",
    });

// Inferred type for handlers
export type CreateCheckoutSessionInput = z.infer<typeof CreateCheckoutSessionSchema>;
