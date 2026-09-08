/* ============================================================
   POST /api/cashfree-create-order

   The buyer's browser posts product ids and an email — no txnId,
   because payment hasn't happened yet. This prices the order from
   the catalogue, opens a Cashfree order for it, and only then
   records our own copy — if Cashfree's side fails, nothing is left
   behind to clean up.

   Deliberate: if either the store or Cashfree is not configured this
   returns 501 and the page falls back to the manual QR/UPI flow. A
   missing environment variable must never cost someone a checkout.
   ============================================================ */

import { buildPending, OrderError } from "./_lib/order.js";
import * as store from "./_lib/store.js";
import * as cashfree from "./_lib/cashfree.js";
import { json, methodIs, body } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;

  if (!store.isConfigured() || !cashfree.isConfigured()) {
    return json(res, 501, {
      error: "Card/UPI checkout is not configured on this deployment.",
      code: "no-gateway",
    });
  }

  let order;
  try {
    order = buildPending(body(req));
  } catch (err) {
    if (err instanceof OrderError) {
      return json(res, 400, { error: err.message, field: err.field });
    }
    throw err;
  }

  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const origin = `${proto}://${req.headers.host}`;

  let session;
  try {
    session = await cashfree.createOrder({
      orderId: order.ref,
      amount: order.total,
      email: order.email,
      returnUrl: `${origin}/cart.html?order=${order.ref}`,
      notifyUrl: `${origin}/api/cashfree-webhook`,
    });
  } catch (err) {
    console.error("cashfree create order failed", err);
    return json(res, 502, {
      error: "The payment gateway did not respond. Nothing was charged — try again, or pay by QR below.",
      code: "gateway-failed",
    });
  }

  try {
    await store.save(order);
  } catch (err) {
    console.error("order save failed", err);
    return json(res, 502, {
      error: "We could not record your order. Nothing was charged by us — send us your reference and we will sort it out.",
      code: "store-failed",
    });
  }

  return json(res, 201, {
    ref: order.ref,
    total: order.total,
    items: order.items,
    email: order.email,
    paymentSessionId: session.paymentSessionId,
    mode: cashfree.mode(),
  });
}
