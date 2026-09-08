/* ============================================================
   GET /api/order-lookup?ref=DV-XXXXXX

   Public, deliberately minimal: a buyer landing back on cart.html
   after paying through Cashfree needs to know whether their order
   is done, nothing more. No admin token, no email, no items, no
   pricing — those already live in the buyer's own browser from the
   create-order response, and re-exposing them here would just be a
   second place for that data to leak from.

   For a Cashfree order still "awaiting-payment", this opportunistically
   calls the same finalize check the webhook does — a backstop for
   when the webhook is slow, lost, or its signature failed to verify
   for a reason unrelated to whether the payment went through. Most
   of the time this is what actually resolves a Cashfree order: the
   buyer's own browser gets here well before some webhooks do.
   ============================================================ */

import * as store from "./_lib/store.js";
import { finalizeIfPaid } from "./_lib/finalize.js";
import { json, methodIs } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "GET")) return;

  if (!store.isConfigured()) {
    return json(res, 501, { error: "Order storage is not configured.", code: "no-store" });
  }

  const ref = String(req.query?.ref ?? "").trim();
  if (!ref) return json(res, 400, { error: "Which order?", field: "ref" });

  try {
    let order = await store.get(ref);
    if (!order) return json(res, 404, { error: `No order ${ref}.` });

    if (order.provider === "cashfree" && order.status === "awaiting-payment") {
      await finalizeIfPaid(ref).catch((err) => {
        // A failed check here just means the buyer sees "still
        // confirming" a little longer — the webhook, or their next
        // poll, gets another chance. Never surface this as an error.
        console.warn("order-lookup finalize check failed", err);
      });
      order = (await store.get(ref)) ?? order;
    }

    return json(res, 200, { ref: order.ref, status: order.status });
  } catch (err) {
    console.error("order lookup failed", err);
    return json(res, 502, { error: "Could not check that order." });
  }
}
