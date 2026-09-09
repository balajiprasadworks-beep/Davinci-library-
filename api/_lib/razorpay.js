/* ============================================================
   RAZORPAY — the real payment gateway path. Optional, like
   everything else back here: with no credentials set,
   isConfigured() is false and checkout falls back to the manual
   QR/UPI flow that always works. A missing environment variable must
   never cost a sale.

   Talked to over the official `razorpay` SDK (razorpay-node) for the
   Orders API calls. That SDK is axios-based, not fetch-based, so it
   does not go through globalThis.fetch — tools/check-api.mjs stubs
   its calls at the HTTP layer instead, with nock, which patches
   Node's http/https module directly (see the note in that file).

   Signature verification (both the checkout handler's payment
   signature and the webhook signature) is done directly with
   node:crypto rather than through the SDK's own
   Razorpay.validateWebhookSignature — the exact HMAC-SHA256 formula
   Razorpay documents and the SDK uses internally, but compared with
   timingSafeEqual rather than `===`: this gates a real financial
   event, and a plain string comparison leaks a signature's length
   and prefix through timing.

   Set in Vercel (Settings -> Environment Variables):
     RAZORPAY_KEY_ID          "Key Id" from the Razorpay dashboard.
                               Not secret by design — Standard
                               Checkout sends it to the browser as
                               part of opening the payment form.
     RAZORPAY_KEY_SECRET      "Key Secret" — pairs with the above,
                               authenticates the Orders API calls, and
                               signs the post-payment verification
                               HMAC.
     RAZORPAY_WEBHOOK_SECRET  Chosen when creating the webhook in the
                               Razorpay dashboard (Settings ->
                               Webhooks) — a secret you type in
                               yourself there, not the same value as
                               the key secret above.

   There is no separate *_ENV switch: Razorpay serves both test and
   live traffic from the one API, and which you're in is decided
   entirely by which key pair you paste in here (test keys start
   "rzp_test_", live keys "rzp_live_") — mode() below just reads that
   back for display, it doesn't select anything.
   ============================================================ */

import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";

export const isConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

/** Not secret — this is what Checkout on the client needs to open. */
export const keyId = () => process.env.RAZORPAY_KEY_ID;

/** Read from which key prefix is in use, not a separate setting — see header. */
export const mode = () => (keyId()?.startsWith("rzp_live_") ? "live" : "test");

/* A fresh client per call, not a module-level singleton — see the
   note in store.js on reading process.env per call rather than at
   import. Constructing one is cheap (no network call of its own). */
const client = () =>
  new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });

/**
 * Create a Razorpay order and get back its id for Checkout to open.
 * Razorpay always mints its own order id — it never accepts ours —
 * so the caller must persist what comes back (as
 * order.gatewayOrderId) to look this order up again later.
 *
 * receipt carries our own ref through to Razorpay's dashboard and,
 * importantly, back out again on the "order.paid" webhook payload
 * (payload.order.entity.receipt) — see razorpay-webhook.js, which
 * reads it straight off the event with no extra lookup.
 */
export async function createOrder({ ref, amount }) {
  const order = await client().orders.create({
    amount: Math.round(amount * 100), // rupees -> paise: the smallest currency subunit
    currency: "INR",
    receipt: ref,
    notes: { ref },
  });
  return { orderId: order.id, status: order.status };
}

/** The authoritative check — never trust a webhook or the checkout
 *  handler's claimed status on its own, always ask Razorpay directly
 *  with our own credentials. */
export async function fetchOrder(orderId) {
  return client().orders.fetch(orderId);
}

export async function isOrderPaid(orderId) {
  const order = await fetchOrder(orderId);
  return order.status === "paid";
}

function hmacHex(message, secret) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqual(expectedHex, suppliedHex) {
  if (!suppliedHex) return false;
  const a = Buffer.from(expectedHex);
  const b = Buffer.from(String(suppliedHex));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifies the {razorpay_order_id, razorpay_payment_id,
 * razorpay_signature} triple Checkout's handler function returns on
 * success, per Razorpay's documented formula:
 *   hmac_sha256(order_id + "|" + payment_id, key_secret)
 * A match only proves Razorpay signed exactly this order/payment
 * pair — it is a fast, cheap check, not the whole security boundary;
 * finalize.js still re-asks Razorpay's Orders API directly before
 * treating anything as paid.
 */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  return safeEqual(hmacHex(`${orderId}|${paymentId}`, process.env.RAZORPAY_KEY_SECRET), signature);
}

/** A courtesy, not the security boundary — see finalizeIfPaid(),
 *  which always re-asks Razorpay directly before marking anything
 *  paid. rawBody must be the exact bytes Razorpay sent, not a
 *  JSON.parse/stringify round trip. */
export function verifyWebhookSignature(signature, rawBody) {
  return safeEqual(hmacHex(rawBody, process.env.RAZORPAY_WEBHOOK_SECRET), signature);
}
