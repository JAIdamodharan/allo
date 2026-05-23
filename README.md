# Allo Engineering Take-Home

This is a Next.js App Router project implementing an inventory and order-fulfillment reservation system to handle concurrent checkout race conditions.

## How to run the app locally

### Prerequisites
- Node.js >= 18
- A PostgreSQL database (e.g., Supabase, Neon, or local Docker)
- (Optional but recommended) An Upstash Redis instance for the idempotency bonus.

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Copy the example environment file and fill in your connection strings.
   ```bash
   cp .env.example .env
   ```
   Provide your `DATABASE_URL`. If you want idempotency support, provide `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (from Upstash).

3. **Database Migrations:**
   Apply the database schema to your Postgres instance:
   ```bash
   npx prisma db push
   # Or npx prisma migrate dev (if you prefer migration history)
   ```

4. **Seed the Database:**
   Populate the database with initial products, warehouses, and stock levels:
   ```bash
   npm run prisma db seed
   ```

5. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the app.

## How the Expiry Mechanism Works in Production

Currently, reservations are stored with an `expiresAt` timestamp and a `status` (`PENDING`, `CONFIRMED`, `RELEASED`).

In this application, we use a **lazy cleanup** combined with an **optimistic check** at the point of confirmation:
- If a user tries to confirm an expired reservation, the `/api/reservations/:id/confirm` endpoint detects it, releases the stock (if it hasn't been already), and returns `410 Gone`.

However, to prevent expired inventory from indefinitely remaining "reserved" when users completely abandon their carts without calling `/confirm` or `/release`, we need an automated cleanup mechanism.

**Production Approach (Scheduled Worker):**
In a production environment, I would use a Cron Job (e.g., Vercel Cron, Inngest, or an AWS EventBridge trigger triggering a worker). 
- A scheduled job runs every 1-2 minutes.
- It executes a SQL query to find all `PENDING` reservations where `expiresAt < NOW()`.
- It performs a batch transaction to set these to `RELEASED` and subtracts the released `quantity` from the `reservedUnits` in the corresponding `StockLevel` rows.

## Concurrency Guarantee

To prevent race conditions, the `/api/reservations` endpoint does not simply read stock and write in two operations. It uses an atomic SQL `UPDATE` statement through Prisma:
```sql
UPDATE "StockLevel"
SET "reservedUnits" = "reservedUnits" + ${quantity}
WHERE "id" = ${stockLevelId}
  AND "totalUnits" - "reservedUnits" >= ${quantity}
```
If the database updates 0 rows, it means the stock was insufficient, and we safely return `409 Conflict`. Since Postgres guarantees row-level atomicity on updates, this makes the reservation process entirely immune to race conditions without requiring complex distributed locks (like Redis `SET NX`) or expensive `Serializable` transactions.

## Trade-offs and Future Improvements

1. **Idempotency with Redis**: I implemented a basic caching mechanism for idempotency using Upstash Redis. If the same client sends multiple requests with the same `Idempotency-Key` header, the server returns the previously cached response. If Redis is unavailable, it gracefully fails. In a perfect production system, we'd ensure stronger consistency between Redis and Postgres, potentially using the Outbox pattern.
2. **Hard Coded Checkout**: The checkout flow UI currently lives on the same page. In a real app, I would build a robust cart context and separate routing for the checkout funnel.
3. **Optimistic Locking**: I used an atomic update for the stock. If we wanted to keep track of a robust audit log, I might use event sourcing (recording inventory events) rather than mutating the row in place, which provides better traceability.
4. **Testing**: Given more time, I would add `jest` or `vitest` tests alongside tools like `testcontainers` to run real concurrent requests against a spun-up Postgres instance to prove the race condition handling.
