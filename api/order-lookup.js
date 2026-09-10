/* ============================================================
   GET /api/order-lookup?ref=DV-XXXXXX

   Public, unauthenticated — order.html polls this right after a
   Razorpay redirect to learn when delivery has actually happened,
   so it can show the download button on the page itself rather
   than making the buyer wait on email.

   Safe without a login because `ref` already acts as a bearer
   token: a random 6-character code from a 25-symbol alphabet (about
   244 billion combinations), shown only to the buyer who placed
   that exact order — the same property the site already relies on
   elsewhere ("email us your reference"). This returns only what
   that buyer already has: their own order, never anyone else's,
   and never a listing of orders.

   Download links are re-presigned on every call rather than read
   back from storage — a presigned URL is a working credential and
   is deliberately never written to the database; see the note in
   api/_lib/deliver.js. Presigning is local computation (no network
   call), so doing it again here costs nothing.
   ============================================================ */

import * as db from "./_lib/db.js";
import * as blob from "./_lib/blob.js";
import { PRODUCTS } from "../js/catalog.js";
import { json, methodIs } from "./_lib/http.js";

function queryRef(req) {
  if (req.query?.ref) return String(req.query.ref);
  try {
    return new URL(req.url, "http://localhost").searchParams.get("ref") ?? "";
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  if (!methodIs(req, res, "GET")) return;

  if (!db.isConfigured()) {
    return json(res, 501, { error: "Order storage is not configured.", code: "no-store" });
  }

  const ref = queryRef(req).trim().toUpperCase();
  if (!ref) return json(res, 400, { error: "Missing ref." });

  let order;
  try {
    order = await db.getByRef(ref);
  } catch (err) {
    console.error("order lookup failed", err);
    return json(res, 502, { error: "Could not look up that order." });
  }

  if (!order) return json(res, 404, { error: "No such order." });

  const delivered = order.status === "delivered";
  const items = await Promise.all(order.items.map(async (item) => {
    if (!delivered) return { id: item.id, title: item.title, price: item.price };

    const path = PRODUCTS.find((p) => p.id === item.id)?.blobPath;
    let fileUrl = null;
    if (path) {
      try {
        fileUrl = await blob.presignDownload(path);
      } catch (err) {
        console.warn(`order-lookup: could not presign a link for ${item.id}:`, err);
      }
    }
    return { id: item.id, title: item.title, price: item.price, fileUrl };
  }));

  return json(res, 200, { ref: order.ref, status: order.status, total: order.total, items });
}
