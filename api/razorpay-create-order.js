/* ============================================================
   POST /api/razorpay-create-order

   The buyer's browser posts product ids and an email — no txnId,
   because payment hasn't happened yet. Prices the order from the
   catalogue, opens a Razorpay order for it, and only then records
   our own copy — if Razorpay's side fails, nothing is left behind to
   clean up.

   Deliberate: if either the store or Razorpay is not configured this
   returns 501 and the page falls back to the manual QR flow. A
   missing environment variable must never cost someone a checkout.
   ============================================================ */

import { buildPending, OrderError } from "./_lib/order.js";
import * as store from "./_lib/store.js";
import * as razorpay from "./_lib/razorpay.js";
import { json, methodIs, body } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;

  if (!store.isConfigured() || !razorpay.isConfigured()) {
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

  let gateway;
  try {
    gateway = await razorpay.createOrder({ ref: order.ref, amount: order.total });
  } catch (err) {
    console.error("razorpay create order failed", err);
    return json(res, 502, {
      error: "The payment gateway did not respond. Nothing was charged — try again, or pay by QR below.",
      code: "gateway-failed",
    });
  }

  // Razorpay mints its own order id — persist the mapping so
  // finalize.js and the webhook can look this order up again later.
  order.gatewayOrderId = gateway.orderId;

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
    razorpayOrderId: gateway.orderId,
    keyId: razorpay.keyId(),
    mode: razorpay.mode(),
  });
}
