/* ============================================================
   POST /api/order-status   — move an order along
   Body: { ref, status }
   Requires: Authorization: Bearer <ADMIN_TOKEN>
   ============================================================ */

import * as store from "./_lib/store.js";
import * as mail from "./_lib/mail.js";
import * as blob from "./_lib/blob.js";
import { STATUSES } from "./_lib/order.js";
import { PRODUCTS } from "../js/catalog.js";
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
      // order.items is the checkout-time snapshot (id, title, price) and
      // never carries a delivery link — resolve whatever blobPath the
      // catalogue holds today, so uploading a note after the order was
      // placed still gets it linked correctly.
      //
      // The store is private, so a blobPath alone isn't a working link —
      // each one needs a fresh presigned URL, generated now rather than
      // once at upload time. That call can fail on its own (a bad
      // pathname, a Blob API hiccup) without one broken title blocking
      // the rest of the order or the "delivered" transition itself, so
      // each is resolved independently and a failure just omits the link
      // for that title.
      const resolvedItems = await Promise.all(order.items.map(async (item) => {
        const path = PRODUCTS.find((p) => p.id === item.id)?.blobPath;
        if (!path) return item;
        try {
          return { ...item, fileUrl: await blob.presignDownload(path) };
        } catch (err) {
          console.warn(`could not presign a link for ${item.id}:`, err);
          return item;
        }
      }));

      const result = await mail.deliveredToBuyer(order, resolvedItems)
        .catch((e) => ({ sent: false, reason: String(e) }));
      notified = result.sent;
      if (!result.sent) console.warn("delivery email not sent:", result.reason);
    }

    return json(res, 200, { order, notified });
  } catch (err) {
    console.error("status update failed", err);
    return json(res, 502, { error: "Could not update the order." });
  }
}
