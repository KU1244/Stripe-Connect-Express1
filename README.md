# stripe-connect-express

> **Stripe Connect Express** implementation with Next.js, Prisma, and PostgreSQL.
> Production‑sane template for marketplace payment splitting and revenue distribution.

[![Node.js](https://img.shields.io/badge/Node.js-20.x_LTS-339933?logo=node.js\&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.4.7-000000?logo=next.js\&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript\&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.18.0-2D3748?logo=prisma\&logoColor=white)](https://www.prisma.io/)
[![Stripe](https://img.shields.io/badge/Stripe-19.1.0-635BFF?logo=stripe\&logoColor=white)](https://stripe.com/)

---

## 🎯 Project Overview

This project implements **Stripe Connect Express** with **destination charges**, enabling:

* 🏪 **Marketplace payment splitting** (platform fee + seller payout)
* 💳 **Onboarding flow** for Express connected accounts (hosted by Stripe)
* 🔄 **Status sync** via webhooks (account + payments + refunds)
* 🔐 **Type‑safe API** with Zod validation
* 🧰 **Prisma schema** for Orders / Refunds / Webhook audit

> Stripe API is initialized with **`apiVersion: '2025-09-30.clover'`** (required by this repo).

---

## 🛠️ Tech Stack

| Category   | Technology             | Version  | Purpose                     |
| ---------- | ---------------------- | -------- | --------------------------- |
| Runtime    | Node.js                | 20.x LTS | Server environment          |
| Framework  | Next.js (Pages Router) | 15.4.7   | API routes & UI             |
| Language   | TypeScript             | 5.6.3    | Type safety (strict)        |
| Database   | PostgreSQL             | 16+      | Persistence                 |
| ORM        | Prisma                 | 6.18.0   | DB toolkit                  |
| Payment    | Stripe (Node SDK)      | 19.1.0   | Payments / Connect          |
| Client     | @stripe/stripe-js      | 8.1.0    | Browser SDK                 |
| Validation | Zod                    | 4.1.12   | Request/response validation |

---

## 📂 Project Structure

```
stripe-connect-express/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── lib/
│   │   ├── env.ts            # Environment validation (Zod)
│   │   ├── json.ts           # JSON helpers for Prisma
│   │   ├── prisma.ts         # Prisma singleton
│   │   └── stripe.ts         # Stripe client initialization
│   ├── pages/
│   │   ├── api/
│   │   │   ├── connect/
│   │   │   │   ├── create-account.ts           # POST: Create Express account
│   │   │   │   ├── get-account-status.ts       # GET: Retrieve account status
│   │   │   │   ├── create-onboarding-link.ts   # POST: Generate onboarding link
│   │   │   │   ├── create-login-link.ts        # POST: Generate dashboard link
│   │   │   │   └── list-accounts.ts            # GET: List all accounts
│   │   │   ├── checkout.ts                     # POST: Create Checkout Session
│   │   │   └── webhook/
│   │   │       └── stripe.ts                   # POST: Stripe webhook handler
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   └── index.tsx
│   └── styles/
│       └── globals.css
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔧 Environment Variables

Create `.env` in the project root:

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/stripe_connect_express?schema=public"

# Stripe (Test)
STRIPE_SECRET_KEY="sk_test_51..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# App URL (used for return_url / refresh_url)
APP_BASE_URL="http://localhost:3000"

NODE_ENV="development"
```

### Stripe Initialization (TypeScript)

```ts
// src/lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});
```

### Webhook (local) via Stripe CLI

```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
# Copy the generated whsec_... into STRIPE_WEBHOOK_SECRET
```

---

## 📊 Database Schema (Core)

> Money stored as **int in smallest unit** (e.g., USD cents). Webhook events are stored for idempotency/audit.

```prisma
enum OrderStatus { created paid refunded }

enum PaymentState { processing succeeded failed refunded_partial refunded_full }

model User {
  id        String   @id @default(cuid())
  email     String   @unique @db.VarChar(254)
  name      String?  @db.VarChar(120)
  accounts  ConnectedAccount[]
  orders    Order[]            @relation("Buyer")
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)
}

model ConnectedAccount {
  id              String  @id @default(cuid())
  userId          String
  stripeAccountId String  @unique @db.VarChar(255)
  chargesEnabled  Boolean @default(false)
  payoutsEnabled  Boolean @default(false)
  detailsSubmitted Boolean @default(false)
  onboardingCompletedAt DateTime? @db.Timestamptz(6)
  country         String? @db.VarChar(2)
  defaultCurrency String? @db.VarChar(3)
  requirements    Json?
  capabilities    Json?
  livemode        Boolean @default(false)
  user            User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  orders          Order[] @relation("SellerAccount")
  createdAt       DateTime @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @db.Timestamptz(6)

  @@index([userId])
  @@index([chargesEnabled, payoutsEnabled])
}

model Order {
  id                String @id @default(cuid())
  buyerId           String?
  buyer             User?   @relation("Buyer", fields: [buyerId], references: [id], onDelete: SetNull)
  sellerAccountId   String
  sellerAccount     ConnectedAccount @relation("SellerAccount", fields: [sellerAccountId], references: [id], onDelete: Restrict)
  paymentIntentId   String  @unique @db.VarChar(255)
  checkoutSessionId String? @unique @db.VarChar(255)
  transferId        String? @unique @db.VarChar(255)
  chargeId          String? @unique @db.VarChar(255)
  amount            Int
  platformFee       Int
  currency          String  @default("USD") @db.VarChar(3)
  status            OrderStatus @default(created)
  paymentState      PaymentState @default(processing)
  amountRefunded    Int @default(0)
  metadata          Json?
  createdAt         DateTime @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime @updatedAt @db.Timestamptz(6)
  Refund            Refund[]

  @@index([sellerAccountId])
  @@index([buyerId])
  @@index([createdAt])
  @@index([paymentState, createdAt])
}

model Refund {
  id String @id @default(cuid())
  orderId String
  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  stripeRefundId String  @unique @db.VarChar(255)
  amount Int
  balanceTransactionId String? @db.VarChar(255)
  reason String? @db.VarChar(64)
  metadata Json?
  createdAt DateTime @default(now()) @db.Timestamptz(6)

  @@index([orderId, createdAt])
}

model WebhookEvent {
  id String @id @default(cuid())
  stripeEventId String @unique @db.VarChar(255)
  livemode Boolean @default(false)
  type String @db.VarChar(64)
  requestId String? @db.VarChar(255)
  apiVersion String? @db.VarChar(32)
  payload Json
  processedAt DateTime? @db.Timestamptz(6)
  createdAt DateTime @default(now()) @db.Timestamptz(6)

  @@index([type, createdAt])
  @@index([processedAt])
}
```

---

## 🔌 API Endpoints

### Connect API

| Endpoint                              | Method | Description                              |
| ------------------------------------- | ------ | ---------------------------------------- |
| `/api/connect/create-account`         | POST   | Create Express connected account         |
| `/api/connect/get-account-status`     | GET    | Retrieve flags (`chargesEnabled`, etc.)  |
| `/api/connect/create-onboarding-link` | POST   | Generate **short‑lived** onboarding link |
| `/api/connect/create-login-link`      | POST   | Generate Express Dashboard login link    |
| `/api/connect/list-accounts`          | GET    | Admin: list accounts                     |

### Checkout API (Destination Charges)

| Endpoint        | Method | Description                                                     |
| --------------- | ------ | --------------------------------------------------------------- |
| `/api/checkout` | POST   | Create Checkout Session with **destination** + **platform fee** |

**Request (one‑time Price):**

```http
POST /api/checkout
Content-Type: application/json
{
  "priceId": "price_123",            // One-time Price (USD)
  "stripeAccountId": "acct_abc",     // or: "userId": "clxxx..."
  "platformFee": 100                  // $1.00 (cents)
}
```

### Webhook API

| Endpoint              | Method | Description                       |
| --------------------- | ------ | --------------------------------- |
| `/api/webhook/stripe` | POST   | Signature‑verified Stripe webhook |

**Handled events (recommended):**

* `account.updated` → sync `ConnectedAccount`
* `checkout.session.completed` / `payment_intent.succeeded` → create/finalize `Order`
* `charge.refunded` / `refund.updated` → insert `Refund`, update `Order.amountRefunded`/`paymentState`

All events stored in `WebhookEvent` for idempotency/audit.

---

## 🧪 Testing

### Minimal happy path

1. **Create User** (Prisma Studio)
2. **Create Connect Account**
   `POST /api/connect/create-account` → returns `acct_...`
3. **Onboarding link**
   `POST /api/connect/create-onboarding-link` → open `url`, submit test data
4. **Verify status**
   `GET /api/connect/get-account-status?userId=...` → expect all `true`
5. **Create one‑time Price (USD)** in Dashboard → copy `price_...`
6. **Checkout**
   `POST /api/checkout` with `{ priceId, stripeAccountId|userId, platformFee }` → open returned `url`
7. **Pay** (test card `4242 4242 4242 4242`) → check balances and `Order`

---

## 🏗️ Architecture Decisions

### Why Destination Charges first?

* Simple, marketplace‑friendly, works well with Express
* Buyer sees platform branding; platform sets `application_fee_amount`
* Automatic transfer to seller via `transfer_data.destination`

### Why Zod & Prisma?

* Zod: runtime validation at API boundaries → stable error handling
* Prisma: typed queries + migrations → maintainable schema, audit tables

---

## 📝 Development Guidelines

* **TypeScript strict** / no `any`
* **Stripe import**: `import Stripe from 'stripe'`
* **Stripe API**: `apiVersion: '2025-09-30.clover'`
* **HTTP codes**: 400 (validation), 404 (not found), 409 (conflict), 500 (unexpected)
* **Idempotency**: use `Idempotency-Key` headers for create endpoints

---

## 🐛 Troubleshooting

**Webhook signature failed**

```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
# update STRIPE_WEBHOOK_SECRET
```

**Multiple Prisma clients**

* Use provided `prisma.ts` singleton; restart dev server if needed.

**404 on /api/checkout/create-session**

* Correct endpoint is **`/api/checkout`** in this repo.

**Body validation error (missing priceId)**

* This API requires **`priceId`** (one‑time Price). Do not send raw `amount`.

---

## 🚢 Deployment

### Vercel

```bash
npm run build
vercel
```

* Set env vars in Vercel dashboard (`DATABASE_URL`, `STRIPE_*`, `APP_BASE_URL`).
* Configure production webhook: `https://yourdomain.com/api/webhook/stripe`.

---

## 📚 Resources

* [Stripe Connect](https://stripe.com/docs/connect)
* [Stripe Checkout](https://stripe.com/docs/payments/checkout)
* [Prisma Docs](https://www.prisma.io/docs)
* [Next.js Docs](https://nextjs.org/docs)
* [Zod](https://zod.dev)

---

## 📄 License

MIT

---

**Project Status**: MVP‑ready
**Last Updated**: October 2025
**Maintainer**: SI
