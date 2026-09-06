/* ============================================================
   POST /api/order-status   — move an order along
   Body: { ref, status }
   Requires: Authorization: Bearer <ADMIN_TOKEN>
   ============================================================ */

import * as store from "./_lib/store.js";
import * as mail from "./_lib/mail.js";
import { STATUSES } from "./_lib/order.js";
import { json, methodIs, body, requireAdmin } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;
  if (!requireAdmin(req, res)) return;

  if (!store.isConfigured()) {
    return json(res, 501, { error: "Order storage is not configured.", code: "no-store" });
  }

  const { ref, status } = body(req);
  if (!ref) return json(res, 400, { error: "Which order?", field: "ref" });
  if (!STATUSES.includes(status)) {
    return json(res, 400, { error: `Status must be one of: ${STATUSES.join(", ")}`, field: "status" });
  }

  try {
    const order = await store.get(String(ref));
    if (!order) return json(res, 404, { error: `No order ${ref}.` });

    const was = order.status;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    await store.save(order);

    // Tell the buyer only on the transition into delivered, so re-saving
    // an already-delivered order does not email them twice.
    let notified = false;
    if (status === "delivered" && was !== "delivered") {
      const result = await mail.deliveredToBuyer(order).catch((e) => ({ sent: false, reason: String(e) }));
      notified = result.sent;
      if (!result.sent) console.warn("delivery email not sent:", result.reason);
    }

    return json(res, 200, { order, notified });
  } catch (err) {
    console.error("status update failed", err);
    return json(res, 502, { error: "Could not update the order." });
  }
}
