-- ============================================================
-- DaVinci Medical Library — order storage on Neon (Postgres).
--
-- One-time setup: paste this into the Neon SQL editor for your
-- project (or `psql "$DATABASE_URL" -f db/schema.sql`).
--
-- One row per order. Orders are created (status='created') the
-- moment a buyer clicks "Pay" and a Razorpay Payment Link is
-- issued; the Razorpay webhook is what ever moves a row to 'paid'
-- and then 'delivered' — nothing in this table is trusted as paid
-- until the webhook says so.
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  ref                       text PRIMARY KEY,
  email                     text NOT NULL,
  items                     jsonb NOT NULL,           -- [{id, title, price}], priced server-side from the catalogue
  total                     integer NOT NULL,          -- rupees, not paise — matches js/catalog.js prices
  status                    text NOT NULL DEFAULT 'created',
    -- created   : payment link issued, buyer has not paid (yet, or ever)
    -- paid      : webhook confirmed payment; delivery is being resolved
    -- delivered : buyer emailed with working download link(s)
    -- failed    : Razorpay reported the payment failed/was cancelled
    -- refunded / cancelled : set by hand from /admin.html
  razorpay_payment_link_id text,
  razorpay_payment_id      text,
  placed_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  delivered_at               timestamptz,
  CONSTRAINT orders_status_check CHECK (
    status IN ('created', 'paid', 'delivered', 'failed', 'refunded', 'cancelled')
  )
);

-- The webhook looks up an order by the Payment Link id Razorpay hands back.
CREATE INDEX IF NOT EXISTS orders_razorpay_payment_link_id_idx
  ON orders (razorpay_payment_link_id);

-- Admin order book, newest first.
CREATE INDEX IF NOT EXISTS orders_placed_at_idx ON orders (placed_at DESC);
