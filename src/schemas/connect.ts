// Zod schemas for Connect (Express) onboarding & account utilities.
// Notes:
// - No deprecated .url(): use AbsoluteUrlSchema from ./common
// - Avoid "any"; prefer inference-friendly exports

import { z } from "zod";
import { AbsoluteUrlSchema } from "./common";

// Create an Express connected account for a user.
export const CreateConnectedAccountSchema = z.object({
    userId: z.string().min(1),
});

// Create onboarding link (either userId or acct_***).
export const CreateAccountLinkSchema = z
    .object({
        userId: z.string().min(1).optional(),
        stripeAccountId: z.string().min(1).optional(), // e.g., "acct_123"
        refreshUrl: AbsoluteUrlSchema,
        returnUrl: AbsoluteUrlSchema,
    })
    .refine((d) => d.userId || d.stripeAccountId, {
        message: "Either userId or stripeAccountId is required",
    });

// Read account status (either userId or acct_***).
export const GetAccountStatusSchema = z
    .object({
        userId: z.string().min(1).optional(),
        stripeAccountId: z.string().min(1).optional(),
    })
    .refine((d) => d.userId || d.stripeAccountId, {
        message: "Either userId or stripeAccountId is required",
    });

// Create Express Dashboard login link (either userId or acct_***).
export const CreateLoginLinkSchema = z
    .object({
        userId: z.string().min(1).optional(),
        stripeAccountId: z.string().min(1).optional(),
    })
    .refine((d) => d.userId || d.stripeAccountId, {
        message: "Either userId or stripeAccountId is required",
    });

// Inferred types (handy for handlers; keeps "any" out)
export type CreateConnectedAccountInput = z.infer<typeof CreateConnectedAccountSchema>;
export type CreateAccountLinkInput = z.infer<typeof CreateAccountLinkSchema>;
export type GetAccountStatusInput = z.infer<typeof GetAccountStatusSchema>;
export type CreateLoginLinkInput = z.infer<typeof CreateLoginLinkSchema>;
