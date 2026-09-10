/* ============================================================
   POST /api/order-status   — manual admin override
   Body: { ref, status }  where status is one of:
     refunded | cancelled | delivered   (delivered = force redeliver)
   Requires: Authorization: Bearer <ADMIN_TOKEN>

   Routine orders never need this — Razorpay's webhook (see
   api/razorpay-webhook.js) marks a paid order delivered and emails
   the buyer automatically, with no admin action involved. This
   exists purely for support cases: refunding a buyer, cancelling a
   stuck order, or forcing a redelivery (fresh links, another email)
   when someone says a link expired or the email never arrived.
   ============================================================ */

import * as db from "./_lib/db.js";
import { deliver } from "./_lib/deliver.js";
import { json, methodIs, body, requireAdmin } from "./_lib/http.js";

const ADMIN_STATUSES = ["refunded", "cancelled", "delivered"];

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;
  if (!requireAdmin(req, res)) return;

  if (!db.isConfigured()) {
    return json(res, 501, { error: "Order storage is not configured.", code: "no-store" });
  }

  const { ref, status } = body(req);
  if (!ref) return json(res, 400, { error: "Which order?", field: "ref" });
  if (!ADMIN_STATUSES.includes(status)) {
    return json(res, 400, { error: `Status must be one of: ${ADMIN_STATUSES.join(", ")}`, field: "status" });
  }

  try {
    const order = await db.getByRef(String(ref));
    if (!order) return json(res, 404, { error: `No order ${ref}.` });

    if (status === "delivered") {
      // Force a fresh delivery pass (new presigned links, another
      // email) regardless of how it was last delivered. Only ever
      // from an already-paid order — an unpaid order must never be
      // pushed to "delivered" by hand, admin mis-click or not.
      if (order.status !== "paid" && order.status !== "delivered") {
        return json(res, 400, {
          error: `Cannot deliver ${order.ref} — its status is "${order.status}", not paid.`,
          field: "status",
        });
      }
      await deliver(order);
      const updated = await db.markDelivered(order.ref);
      return json(res, 200, { order: updated, notified: true });
    }

    const updated = await db.setStatus(order.ref, status);
    return json(res, 200, { order: updated, notified: false });
  } catch (err) {
    console.error("status update failed", err);
    return json(res, 502, { error: "Could not update the order." });
  }
}
