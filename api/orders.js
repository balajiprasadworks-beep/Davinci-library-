/* ============================================================
   GET /api/orders          — the seller's order book
   Requires: Authorization: Bearer <ADMIN_TOKEN>
   ============================================================ */

import * as store from "./_lib/store.js";
import { json, methodIs, requireAdmin } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "GET")) return;
  if (!requireAdmin(req, res)) return;

  if (!store.isConfigured()) {
    return json(res, 501, { error: "Order storage is not configured.", code: "no-store" });
  }

  try {
    const orders = await store.list();
    return json(res, 200, {
      orders,
      count: orders.length,
      outstanding: orders.filter((o) => o.status === "awaiting-payment-check").length,
      revenue: orders.filter((o) => o.status === "delivered").reduce((s, o) => s + o.total, 0),
    });
  } catch (err) {
    console.error("order list failed", err);
    return json(res, 502, { error: "Could not read the order store." });
  }
}
