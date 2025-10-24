// URL validator without using deprecated Zod .url()
// - Accepts only absolute http/https URLs.
// - Keeps types strict without `any`.
import { z } from "zod";

export const AbsoluteUrlSchema = z
    .string()
    .min(1)
    .refine((s) => {
        try {
            const u = new URL(s);
            return u.protocol === "http:" || u.protocol === "https:";
        } catch {
            return false;
        }
    }, { message: "Invalid URL" });
