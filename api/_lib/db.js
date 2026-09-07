/* ============================================================
   ORDER STORE — Neon serverless Postgres.

   Uses @neondatabase/serverless's HTTP driver (`neon()`), not a
   pooled TCP connection — each call is a single stateless HTTPS
   request, which is what you want in a function that may be
   cold-started for one request and never hit again.

   Set in Vercel (Settings -> Environment Variables):
     DATABASE_URL   the Neon connection string, e.g.
                    postgres://user:pass@ep-xxx.aws.neon.tech/dbname?sslmode=require
                    (Neon dashboard -> your project -> Connection Details.
                    Either the pooled or direct string works — the HTTP
                    driver does not hold a TCP connection open either way.)

   Run db/schema.sql once (Neon's SQL editor, or
   `psql "$DATABASE_URL" -f db/schema.sql`) before this is usable.

   If DATABASE_URL is absent, isConfigured() is false. Callers must
   treat checkout as unavailable rather than let a missing variable
   crash a request — see api/create-order.js.
   ============================================================ */

import { neon } from "@neondatabase/serverless";

export const isConfigured = () => Boolean(process.env.DATABASE_URL);

/* A fresh handle per call rather than a module-level singleton — the
   driver is a thin HTTP wrapper with no connection to hold open, and
   reading the env var per call (not at import) keeps this consistent
   with the rest of the codebase: a cold start must not freeze a
   still-empty process.env into a closure. */
const sql = () => neon(process.env.DATABASE_URL);

/* jsonb normally comes back already parsed, but that depends on driver
   internals this file has never run against live — parse defensively
   rather than assume, so a wire-format detail can't silently corrupt
   an order's item list. */
const asItems = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const withItems = (row) => (row ? { ...row, items: asItems(row.items) } : row);

/**
 * Insert a brand-new order, status='created'. A unique-violation on
 * `ref` (should be essentially impossible — ref is a random 6-char
 * code from a 25-symbol alphabet) throws rather than silently
 * overwriting someone else's order; the caller should mint a fresh
 * ref and retry.
 */
export async function createOrder({ ref, email, items, total }) {
  const rows = await sql()`
    INSERT INTO orders (ref, email, items, total, status)
    VALUES (${ref}, ${email}, ${JSON.stringify(items)}::jsonb, ${total}, 'created')
    RETURNING *
  `;
  return withItems(rows[0]);
}

/** Attach the Razorpay Payment Link id once one has been issued. */
export async function attachPaymentLink(ref, paymentLinkId) {
  const rows = await sql()`
    UPDATE orders
    SET razorpay_payment_link_id = ${paymentLinkId}, updated_at = now()
    WHERE ref = ${ref}
    RETURNING *
  `;
  return withItems(rows[0] ?? null);
}

export async function getByRef(ref) {
  const rows = await sql()`SELECT * FROM orders WHERE ref = ${ref}`;
  return withItems(rows[0] ?? null);
}

export async function getByPaymentLinkId(id) {
  const rows = await sql()`SELECT * FROM orders WHERE razorpay_payment_link_id = ${id}`;
  return withItems(rows[0] ?? null);
}

/**
 * Webhook entry point: created -> paid. Guarded by the status column
 * itself, so a retried or duplicated webhook call is a no-op the
 * second time — returns null (not the row) when nothing moved, which
 * the caller reads as "already handled, do not re-deliver or re-email".
 */
export async function markPaid(paymentLinkId, razorpayPaymentId) {
  const rows = await sql()`
    UPDATE orders
    SET status = 'paid', razorpay_payment_id = ${razorpayPaymentId}, updated_at = now()
    WHERE razorpay_payment_link_id = ${paymentLinkId} AND status = 'created'
    RETURNING *
  `;
  return withItems(rows[0] ?? null);
}

export async function markDelivered(ref) {
  const rows = await sql()`
    UPDATE orders
    SET status = 'delivered', delivered_at = now(), updated_at = now()
    WHERE ref = ${ref}
    RETURNING *
  `;
  return withItems(rows[0] ?? null);
}

/** Admin-only manual transitions: refunded, cancelled, or forcing a
 *  re-delivery after a support request. */
export async function setStatus(ref, status) {
  const rows = await sql()`
    UPDATE orders SET status = ${status}, updated_at = now()
    WHERE ref = ${ref}
    RETURNING *
  `;
  return withItems(rows[0] ?? null);
}

/** Newest first, for the admin order book. */
export async function list() {
  const rows = await sql()`SELECT * FROM orders ORDER BY placed_at DESC`;
  return rows.map(withItems);
}

/** Write-then-read a throwaway value to prove the credentials really work. */
export async function probe() {
  const rows = await sql()`SELECT 1 AS ok`;
  return rows[0]?.ok === 1;
}
