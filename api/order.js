/* ============================================================
   POST /api/order

   The buyer's browser posts product ids, an email and the UPI
   reference. The server prices the order from the catalogue,
   stores it, and emails the seller.

   Deliberate: if the store is not configured this returns 501 and
   the page falls back to its original local-only flow. A missing
   environment variable must never cost someone a checkout.
   ============================================================ */

import { build, OrderError } from "./_lib/order.js";
import * as store from "./_lib/store.js";
import * as mail from "./_lib/mail.js";
import { json, methodIs, body } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;

  if (!store.isConfigured()) {
    return json(res, 501, {
      error: "Order storage is not configured on this deployment.",
      code: "no-store",
    });
  }

  let order;
  try {
    order = build(body(req));
  } catch (err) {
    if (err instanceof OrderError) {
      return json(res, 400, { error: err.message, field: err.field });
    }
    throw err;
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

  // The order is safe at this point. Mail is best-effort: a bounced
  // notification is not a reason to tell the buyer their order failed.
  const [sellerMail, buyerMail] = await Promise.allSettled([
    mail.alertSeller(order),
    mail.receiptToBuyer(order),
  ]);
  for (const [who, result] of [["seller", sellerMail], ["buyer", buyerMail]]) {
    if (result.status === "rejected") console.error(`${who} email threw`, result.reason);
    else if (!result.value.sent) console.warn(`${who} email not sent: ${result.value.reason}`);
  }

  return json(res, 201, {
    ref: order.ref,
    placedAt: order.placedAt,
    total: order.total,
    items: order.items,
    email: order.email,
    // Lets the page tell the buyer whether to expect a receipt.
    receiptSent: buyerMail.status === "fulfilled" && buyerMail.value.sent,
  });
}
