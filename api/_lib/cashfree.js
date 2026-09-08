/* ============================================================
   CASHFREE — the real payment gateway path.

   Optional, like everything else back here: with no credentials
   set, isConfigured() is false and checkout falls straight back to
   the manual QR/UPI flow that has always worked. A missing
   environment variable must never cost a sale.

   Talked to over raw fetch, not the cashfree-pg SDK — same reason
   store.js and mail.js do the same: a plain fetch is stubbable in
   the test suite and has no retry/network behaviour of its own to
   fight. (A different SDK, @vercel/blob, taught this the hard way:
   its own fetch bypasses globalThis.fetch stubbing entirely and, in
   one sandboxed test run, hung well past any timeout it was handed.
   Raw fetch has none of that.)

   Set in Vercel (Settings -> Environment Variables):
     CASHFREE_APP_ID       "x-client-id" from the Cashfree dashboard
     CASHFREE_SECRET_KEY   "x-client-secret" — also the webhook
                            signing secret, Cashfree uses one key
                            for both
     CASHFREE_ENV          "PRODUCTION" to take real payments.
                            Anything else (including unset) means
                            sandbox — test money only. Deliberately
                            not defaulting to PRODUCTION: a typo here
                            must fail toward "no real charges", not
                            the other way round.
   ============================================================ */

import { createHmac, timingSafeEqual } from "node:crypto";

const API_VERSION = "2023-08-01";

export const isConfigured = () =>
  Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);

/** "sandbox" everywhere except an explicit, deliberate "PRODUCTION". */
export const mode = () => (process.env.CASHFREE_ENV === "PRODUCTION" ? "production" : "sandbox");

const baseUrl = () =>
  mode() === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";

const headers = () => ({
  "x-client-id": process.env.CASHFREE_APP_ID,
  "x-client-secret": process.env.CASHFREE_SECRET_KEY,
  "x-api-version": API_VERSION,
  "Content-Type": "application/json",
});

/**
 * Create a Cashfree order and get back a payment_session_id for the
 * Checkout SDK to open. orderId becomes Cashfree's order_id — reuse
 * our own order ref so the two systems share one identifier, nothing
 * to map between them later.
 *
 * Cashfree requires a customer phone number; this site has never
 * collected one, so a fixed placeholder is sent — Cashfree's own
 * docs describe this as fine when phone isn't otherwise needed.
 */
export async function createOrder({ orderId, amount, email, returnUrl, notifyUrl }) {
  const res = await fetch(`${baseUrl()}/orders`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      order_id: orderId,
      order_amount: amount,
      order_currency: "INR",
      customer_details: {
        customer_id: orderId,
        customer_email: email,
        customer_phone: "9999999999",
      },
      order_meta: { return_url: returnUrl, notify_url: notifyUrl },
    }),
  });
  if (!res.ok) throw new Error(`Cashfree create order failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  return { paymentSessionId: data.payment_session_id, orderStatus: data.order_status };
}

/** The authoritative check — never trust a webhook body's claimed status
 *  on its own, always ask Cashfree directly with our own credentials. */
export async function fetchOrder(orderId) {
  const res = await fetch(`${baseUrl()}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Cashfree fetch order failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * signature = base64(HMAC-SHA256(secret, timestamp + rawBody)) — the
 * same check Cashfree's own SDKs perform. rawBody must be the exact
 * bytes Cashfree sent, not a JSON.parse/stringify round trip, or a
 * genuine webhook can fail to verify over nothing more than key
 * ordering. Compared in constant time for the same reason the admin
 * token is (see http.js) — this gates a real financial event.
 */
export function verifyWebhookSignature(signature, rawBody, timestamp) {
  if (!signature || !timestamp) return false;
  const expected = createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
    .update(timestamp + rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
