// Initialize Stripe once. Do not leak the key in logs.
import Stripe from "stripe";
import { env } from "./env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-09-30.clover",
});
