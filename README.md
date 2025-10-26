# stripe-connect-express

> **Stripe Connect Express** implementation with Next.js, Prisma, and PostgreSQL.  
> Production-ready SaaS template for marketplace payment splitting and revenue distribution.

[![Node.js](https://img.shields.io/badge/Node.js-20.x_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.4.7-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.18.0-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Stripe](https://img.shields.io/badge/Stripe-19.1.0-635BFF?logo=stripe&logoColor=white)](https://stripe.com/)

---

## 🎯 Project Overview

This project implements **Stripe Connect Express** with destination charges, enabling:

- 🏪 **Marketplace payment splitting** (platform fee + seller payout)
- 💳 **Onboarding flow** for Express connected accounts
- 📊 **Real-time status sync** via webhooks
- 🔐 **Type-safe API** with Zod validation
- 📈 **Production-ready** error handling and logging

---

## 🛠️ Tech Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Runtime** | Node.js | 20.x LTS | Server environment |
| **Framework** | Next.js (Pages Router) | 15.4.7 | React framework |
| **Language** | TypeScript | 5.6.3 | Type safety |
| **Database** | PostgreSQL | 16+ | Data persistence |
| **ORM** | Prisma | 6.18.0 | Database toolkit |
| **Payment** | Stripe (Node SDK) | 19.1.0 | Payment processing |
| **Payment (Client)** | @stripe/stripe-js | 8.1.0 | Browser SDK |
| **Styling** | Tailwind CSS | 4.1.15 | Utility-first CSS |
| **Validation** | Zod | 4.1.12 | Schema validation |
| **State** | Zustand | 5.0.5 | State management |

---

## 📂 Project Structure

```
stripe-connect-express/
├── prisma/
│   ├── migrations/           # Database migrations
│   └── schema.prisma         # Database schema
├── src/
│   ├── lib/
│   │   ├── env.ts           # Environment validation (Zod)
│   │   ├── json.ts          # JSON helpers for Prisma
│   │   ├── prisma.ts        # Prisma singleton
│   │   └── stripe.ts        # Stripe client initialization
│   ├── schemas/
│   │   ├── common.ts        # Shared Zod schemas
│   │   ├── connect.ts       # Connect API schemas
│   │   └── checkout.ts      # Checkout API schemas
│   ├── pages/
│   │   ├── api/
│   │   │   ├── connect/
│   │   │   │   ├── create-account.ts           # POST: Create Express account
│   │   │   │   ├── get-account-status.ts       # GET: Retrieve account status
│   │   │   │   ├── create-onboarding-link.ts   # POST: Generate onboarding link
│   │   │   │   ├── create-login-link.ts        # POST: Generate dashboard link
│   │   │   │   └── list-accounts.ts            # GET: List all accounts
│   │   │   ├── checkout/
│   │   │   │   └── checkout.ts                 # POST: Create Checkout Session
│   │   │   └── webhooks/
│   │   │       └── stripe.ts                   # POST: Stripe webhook handler
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   └── index.tsx
│   └── styles/
│       └── globals.css       # @import "tailwindcss"
├── .env                      # Environment variables (gitignored)
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
├── postcss.config.mjs
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.x LTS ([Download](https://nodejs.org/))
- **PostgreSQL** 16+ ([Download](https://www.postgresql.org/download/))
- **Stripe Account** ([Sign up](https://dashboard.stripe.com/register))

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/stripe-connect-express.git
cd stripe-connect-express

# Install dependencies
npm ci

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma Client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Start development server
npm run dev
```

---

## 🔧 Environment Variables

Create `.env` file in the root directory:

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/stripe_connect_express?schema=public"

# Stripe Keys (Test Mode)
STRIPE_SECRET_KEY="sk_test_51..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# App URLs
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Node Environment
NODE_ENV="development"
```

### Getting Stripe Keys

1. **API Keys**: [Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys)
2. **Webhook Secret**:
  - Create endpoint: `http://localhost:3000/api/webhooks/stripe`
  - Select events: `account.updated`, `payment_intent.succeeded`, `checkout.session.completed`
  - Copy signing secret

---

## 📊 Database Schema

### Core Models

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  accounts  ConnectedAccount[]
  orders    Order[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ConnectedAccount {
  id                    String    @id @default(cuid())
  userId                String
  stripeAccountId       String    @unique
  chargesEnabled        Boolean   @default(false)
  payoutsEnabled        Boolean   @default(false)
  detailsSubmitted      Boolean   @default(false)
  onboardingCompletedAt DateTime?
  country               String?
  defaultCurrency       String?
  requirements          Json?
  capabilities          Json?
  user                  User      @relation(fields: [userId], references: [id])
  orders                Order[]
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}

model Order {
  id                String           @id @default(cuid())
  buyerId           String?
  sellerAccountId   String
  paymentIntentId   String           @unique
  checkoutSessionId String?          @unique
  transferId        String?          @unique
  chargeId          String?          @unique
  amount            Int
  platformFee       Int
  currency          String           @default("USD")
  status            OrderStatus      @default(created)
  paymentState      PaymentState     @default(processing)
  amountRefunded    Int              @default(0)
  metadata          Json?
  buyer             User?            @relation(fields: [buyerId], references: [id])
  sellerAccount     ConnectedAccount @relation(fields: [sellerAccountId], references: [id])
  refunds           Refund[]
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
}

model Refund {
  id                   String   @id @default(cuid())
  orderId              String
  stripeRefundId       String   @unique
  amount               Int
  balanceTransactionId String?
  reason               String?
  metadata             Json?
  order                Order    @relation(fields: [orderId], references: [id])
  createdAt            DateTime @default(now())
}

model WebhookEvent {
  id            String    @id @default(cuid())
  stripeEventId String    @unique
  livemode      Boolean   @default(false)
  type          String
  requestId     String?
  apiVersion    String?
  payload       Json
  processedAt   DateTime?
  createdAt     DateTime  @default(now())
}
```

---

## 🔌 API Endpoints

### Connect API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/connect/create-account` | POST | Create Express connected account |
| `/api/connect/get-account-status` | GET | Retrieve account status and sync to DB |
| `/api/connect/create-onboarding-link` | POST | Generate onboarding link (expires in 5 min) |
| `/api/connect/create-login-link` | POST | Generate Express Dashboard login link |
| `/api/connect/list-accounts` | GET | List all connected accounts (admin) |

### Checkout API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/checkout/checkout` | POST | Create Checkout Session with destination charges |

### Webhook API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks/stripe` | POST | Handle Stripe webhook events |

---

## 🧪 Testing

### Manual Testing Flow

1. **Create User** (via Prisma Studio)
   ```bash
   npx prisma studio
   # Add User: email, name
   # Copy user ID
   ```

2. **Create Connect Account**
   ```http
   POST http://localhost:3000/api/connect/create-account
   Content-Type: application/json

   {
     "userId": "clxxx..."
   }
   ```

3. **Generate Onboarding Link**
   ```http
   POST http://localhost:3000/api/connect/create-onboarding-link
   Content-Type: application/json

   {
     "userId": "clxxx...",
     "refreshUrl": "http://localhost:3000/connect/refresh",
     "returnUrl": "http://localhost:3000/connect/return"
   }
   ```

4. **Complete Onboarding**
  - Open returned URL in browser
  - Fill in test data (Stripe provides test values)
  - Submit form

5. **Verify Status**
   ```http
   GET http://localhost:3000/api/connect/get-account-status?userId=clxxx...
   ```

   Expected response:
   ```json
   {
     "chargesEnabled": true,
     "payoutsEnabled": true,
     "detailsSubmitted": true
   }
   ```

---

## 🏗️ Architecture Decisions

### Why Destination Charges?

- **Simpler compliance**: Platform handles card payments
- **Better UX**: Buyers see platform name on statements
- **Automatic transfers**: Funds move to seller automatically
- **Fee flexibility**: Easy to adjust platform fee percentage

### Why Prisma?

- **Type safety**: Auto-generated types from schema
- **Migration management**: Version-controlled schema changes
- **Connection pooling**: Singleton pattern prevents exhaustion
- **Developer experience**: Intuitive query API

### Why Zod?

- **Runtime validation**: Type safety at API boundaries
- **Composable schemas**: Reusable validation logic
- **Error messages**: Clear feedback for invalid requests
- **TypeScript integration**: Inferred types from schemas

---

## 📝 Development Guidelines

### Code Style

- **Comments**: English (for open-source readiness)
- **Naming**: Descriptive verb-based (`create-account`, `get-status`)
- **Types**: No `any` type (strict mode enabled)
- **Errors**: Consistent HTTP status codes (400, 404, 409, 500)

### Git Workflow

```bash
# Feature branch
git checkout -b feature/add-refund-api

# Commit messages (Conventional Commits)
git commit -m "feat: add refund API endpoint"
git commit -m "fix: handle missing stripeAccountId in webhook"
git commit -m "docs: update API testing instructions"

# Push and create PR
git push origin feature/add-refund-api
```

### Database Migrations

```bash
# Create migration
npx prisma migrate dev --name add_refund_table

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

---

## 🐛 Troubleshooting

### Common Issues

**Issue**: `Prisma Client not generated`
```bash
# Solution
npx prisma generate
```

**Issue**: `Database connection failed`
```bash
# Check PostgreSQL is running
docker ps
# or
pg_isready

# Verify DATABASE_URL in .env
```

**Issue**: `Stripe webhook signature verification failed`
```bash
# Solution: Use Stripe CLI for local testing
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy webhook signing secret to .env
```

**Issue**: `Multiple Prisma Client instances`
```bash
# Restart dev server
# Prisma uses singleton pattern to prevent this
```

---

## 🚢 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel Dashboard
# Set DATABASE_URL to production PostgreSQL
```

### Environment Variables (Production)

- Use **live mode** Stripe keys (`sk_live_...`)
- Set `NODE_ENV=production`
- Configure webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`

---

## 📚 Resources

- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Zod Documentation](https://zod.dev/)

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with ❤️ using [Stripe Connect](https://stripe.com/connect)
- Inspired by modern SaaS architectures
- Special thanks to the open-source community

---

**Project Status**: ✅ Production Ready  
**Last Updated**: October 2025  
**Maintainer**: [@yourusername](https://github.com/yourusername)