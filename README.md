# StockReserve - Inventory Reservation System

A production-ready inventory reservation system that prevents overselling by temporarily reserving stock during checkout. Built with Next.js, TypeScript, Prisma, and PostgreSQL (Supabase).

## Live Demo

**[Live URL](https://reserve-flow-8.preview.emergentagent.com)** - Fully functional with seeded data.

## The Problem

When users checkout, payment takes time (UPI, OTP, etc.). During this time:
- If stock is deducted **only after payment** -> overselling occurs
- If stock is deducted **at add-to-cart** -> fake depletion occurs

## The Solution

A **reservation system** with three states:
1. **Reserve** - Temporarily hold stock for 10 minutes at checkout
2. **Confirm** - Payment succeeds -> permanently deduct stock
3. **Release** - Payment fails or timer expires -> return stock to inventory

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma 6 |
| Styling | Tailwind CSS + shadcn/ui |
| Concurrency | PostgreSQL `SELECT ... FOR UPDATE` (row-level locking) |

---

## Getting Started

### Prerequisites
- Node.js >= 18
- A Supabase project (free tier works) or any hosted PostgreSQL

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd inventory-reservation
yarn install
```

### 2. Environment Variables
Create a `.env` file:
```env
DATABASE_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

**How to get these from Supabase:**
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project -> Settings -> Database
3. Copy the **Transaction** connection string (port 6543) for `DATABASE_URL`
4. Copy the **Session** connection string (port 5432) for `DIRECT_URL`
5. Append `?pgbouncer=true` to `DATABASE_URL`

### 3. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (creates tables)
npx prisma db push

# Seed sample data
npx ts-node prisma/seed.ts
```

### 4. Run
```bash
yarn dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Database Schema

```
Product        Warehouse       Inventory              Reservation
--------       ----------      ----------             ------------
id (uuid)      id (uuid)       id (uuid)              id (uuid)
name           name            productId (FK)         productId (FK)
description    location        warehouseId (FK)       warehouseId (FK)
price          emoji           totalStock             quantity
category                       reservedStock          status (pending|confirmed|released)
emoji                          [unique: product+wh]   expiresAt
                                                      createdAt
                                                      confirmedAt?
                                                      releasedAt?
                                                      releaseReason?
```

**Key relationship:** `Inventory` has a unique compound index on `(productId, warehouseId)`, ensuring one stock record per product-warehouse pair. `availableStock = totalStock - reservedStock`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/products` | List products with available stock per warehouse |
| `GET` | `/api/warehouses` | List all warehouses |
| `GET` | `/api/reservations` | List all reservations (most recent first) |
| `POST` | `/api/reservations` | **Create reservation** (concurrency-safe) |
| `POST` | `/api/reservations/:id/confirm` | Confirm reservation (payment success) |
| `POST` | `/api/reservations/:id/release` | Release reservation (cancel/fail) |
| `POST` | `/api/seed` | Reset & reseed database |
| `GET` | `/api/health` | Health check |

### Error Codes
- `409` - Not enough stock (concurrent conflict)
- `410` - Reservation expired
- `400` - Invalid input or already confirmed/released
- `404` - Not found

### Idempotency
Pass `Idempotency-Key` header with `POST /api/reservations` to prevent duplicate reservations from network retries.

---

## Concurrency Handling (Core Design)

This is the most critical part. Two users clicking "Reserve" on the last item at the exact same time must result in **only one** succeeding.

### Approach: PostgreSQL Row-Level Locking (`SELECT ... FOR UPDATE`)

```typescript
const result = await prisma.$transaction(async (tx) => {
  // 1. Lock the inventory row - blocks other transactions
  const [inventory] = await tx.$queryRaw`
    SELECT * FROM "Inventory"
    WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
    FOR UPDATE
  `;

  // 2. Check available stock (while holding the lock)
  if (inventory.totalStock - inventory.reservedStock < quantity) {
    throw new Error('INSUFFICIENT_STOCK');
  }

  // 3. Increment reservedStock
  await tx.inventory.update({
    where: { productId_warehouseId: { productId, warehouseId } },
    data: { reservedStock: { increment: quantity } },
  });

  // 4. Create the reservation
  return tx.reservation.create({ ... });
});
```

**How it works:**
1. `SELECT ... FOR UPDATE` acquires an exclusive row-level lock on the inventory row
2. Any concurrent transaction trying to lock the same row **waits** until the first transaction commits or rolls back
3. After the first transaction commits (with decremented stock), the second transaction reads the updated value and sees insufficient stock
4. This guarantees **exactly one** reservation succeeds for the last item

**Why this over alternatives:**
- **vs. Optimistic locking (version column):** FOR UPDATE is simpler and avoids retry loops. With optimistic locking, under high contention, many requests would need to retry, increasing latency.
- **vs. Redis distributed locks:** Adds infrastructure complexity. PostgreSQL row-level locking is built-in, ACID-compliant, and doesn't require managing lock expiry.
- **vs. Application-level mutexes:** Don't work in multi-instance deployments. Database locks work across all instances.

---

## Expiry Mechanism

Reservations expire after **10 minutes**. The system uses **lazy cleanup**:

```
Every API request -> cleanupExpiredReservations()
  -> Find all reservations WHERE status='pending' AND expiresAt <= NOW()
  -> For each: decrement reservedStock, set status='released'
```

### Why lazy cleanup?

| Approach | Pros | Cons |
|----------|------|------|
| **Lazy cleanup** (chosen) | Zero infrastructure, works everywhere, no cron needed | Small delay before expired stock becomes visible |
| Cron job | Precise timing | Requires cron infrastructure (Vercel Cron, etc.) |
| Background worker | Real-time | Requires separate process, complexity |
| PostgreSQL `pg_cron` | Database-native | Not available on all hosts |

**In production with higher traffic,** I would add a Vercel Cron Job (`/api/cron/cleanup`) running every minute as a complement to lazy cleanup. The lazy cleanup ensures correctness even if the cron fails.

---

## Trade-offs & Decisions

### 1. Catch-All Route vs. Separate Route Files
**Chose:** Single catch-all route (`/api/[[...path]]/route.ts`)
**Why:** Simpler for a small API surface. All routes in one file makes the reservation logic easy to follow.
**With more time:** Split into separate route files per resource for better maintainability.

### 2. No Authentication
**Chose:** No auth - all reservations are visible to everyone
**Why:** Not part of the core problem (concurrency handling). Would add complexity without demonstrating the key skill.
**With more time:** Add session-based ownership so users only see their reservations.

### 3. Prisma 6 vs Prisma 7
**Chose:** Prisma 6
**Why:** Prisma 7 introduced breaking changes (adapter pattern, config file migration) that add complexity without benefit for this use case. Prisma 6 is stable and well-documented.

### 4. No Redis
**Chose:** Pure PostgreSQL for locking and idempotency
**Why:** `SELECT ... FOR UPDATE` provides the same correctness guarantees without additional infrastructure. Idempotency keys are stored in PostgreSQL with a TTL cleanup.
**With more time:** Redis would improve performance for idempotency checks (O(1) vs O(log n)) and could serve as a distributed rate limiter.

### 5. Lazy vs. Active Expiry
**Chose:** Lazy cleanup (on each API call)
**Why:** Zero infrastructure overhead. Works in any environment.
**With more time:** Add Vercel Cron for proactive cleanup + lazy as fallback.

### 6. Supabase Transaction Pooler
**Chose:** PgBouncer transaction pooler (port 6543)
**Why:** Required for serverless environments like Vercel where connections are short-lived. Transaction pooler assigns a connection per transaction, then returns it to the pool.

---

## Project Structure

```
.
├── app/
│   ├── api/[[...path]]/route.ts   # All API endpoints
│   ├── page.tsx                    # Frontend (React)
│   ├── layout.tsx                  # Root layout
│   └── globals.css                 # Tailwind + theme
├── prisma/
│   ├── schema.prisma               # Database schema
│   └── seed.ts                     # Seed script
├── lib/
│   └── prisma.ts                   # Prisma client singleton
├── components/ui/                  # shadcn components
├── .env                            # Environment variables
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## What I Would Do With More Time

1. **Separate API routes** - Split `route.ts` into individual files per resource
2. **Zod validation** - Add input validation schemas shared between client and server
3. **User authentication** - Session-based reservation ownership
4. **Vercel Cron** - Proactive expiry cleanup every minute
5. **Redis** - For distributed locking under extreme concurrency + idempotency cache
6. **Optimistic UI** - Update stock counts instantly before API response
7. **WebSocket/SSE** - Real-time stock updates across tabs
8. **Rate limiting** - Prevent reservation spam
9. **Monitoring** - Track reservation success/failure rates
10. **Load testing** - Verify behavior under 100+ concurrent reservations
