/* ============================================================
   POST /api/razorpay-webhook

   Razorpay calls this directly, server to server, when a Payment
   Link is paid, expires, or is cancelled. This is the ONLY place
   in the codebase allowed to decide "the buyer actually paid" —
   nothing client-side (a redirect back, a query string) is trusted
   for that.

   Configure in Razorpay Dashboard -> Settings -> Webhooks:
     URL:    https://<your-domain>/api/razorpay-webhook
     Secret: any string you choose — put the SAME string in
             RAZORPAY_WEBHOOK_SECRET (Vercel env vars). This is a
             separate value from your API key/secret.
     Events: payment_link.paid          (required — triggers delivery)
             payment_link.expired,
             payment_link.cancelled     (optional — keeps the admin
                                          order book accurate)

   Body parsing is disabled for this route (see the config export
   below) because Razorpay's signature is computed over the exact
   raw request bytes. Re-serialising a parsed object is not
   guaranteed to reproduce those bytes byte-for-byte, and a single
   differing space would make every signature fail to verify.

   Razorpay retries a webhook call that does not return 2xx, so a
   transient database or mail failure here should surface as a 5xx
   (see the catch below) rather than being swallowed — losing a
   confirmed payment silently is far worse than one retried delivery.
   ============================================================ */

import * as db from "./_lib/db.js";
import * as razorpay from "./_lib/razorpay.js";
import { deliver } from "./_lib/deliver.js";
import { json } from "./_lib/http.js";

export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Use POST." });
  }

  if (!razorpay.webhookConfigured()) {
    // 200 either way: Razorpay only retries on non-2xx, and a
    // misconfigured deployment retrying forever helps nobody. The
    // seller learns about this from /admin.html's health panel.
    console.error("razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set");
    return json(res, 200, { received: true, ignored: "webhook not configured" });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-razorpay-signature"];

  if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
    console.error("razorpay webhook signature mismatch — check RAZORPAY_WEBHOOK_SECRET matches the Dashboard");
    return json(res, 400, { error: "Bad signature." });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return json(res, 400, { error: "Bad JSON." });
  }

  if (!db.isConfigured()) {
    console.error("razorpay webhook verified but DATABASE_URL is not set — payment confirmed but not recorded");
    return json(res, 200, { received: true, ignored: "store not configured" });
  }

  const linkId = event?.payload?.payment_link?.entity?.id;
  const paymentId = event?.payload?.payment?.entity?.id ?? null;

  try {
    if (event.event === "payment_link.paid" && linkId) {
      // markPaid only succeeds on a fresh created -> paid transition,
      // so a webhook Razorpay retries (duplicate delivery of the same
      // event) returns null here rather than re-triggering anything.
      let order = await db.markPaid(linkId, paymentId);
      if (!order) order = await db.getByPaymentLinkId(linkId);

      // status still 'paid' covers both the fresh case and a retry
      // where a previous attempt reached 'paid' but crashed before
      // finishing delivery — either way, delivery has not actually
      // happened yet, so it is safe and necessary to run it now.
      if (order && order.status === "paid") {
        await deliver(order);
        await db.markDelivered(order.ref);
      }
      // status already 'delivered' -> genuinely handled, no-op.
    } else if (
      (event.event === "payment_link.expired" || event.event === "payment_link.cancelled") &&
      linkId
    ) {
      const order = await db.getByPaymentLinkId(linkId);
      if (order && order.status === "created") {
        await db.setStatus(order.ref, "failed");
      }
    }
  } catch (err) {
    console.error("webhook handling failed", err);
    return json(res, 500, { error: "Could not process the event." });
  }

  return json(res, 200, { received: true });
}
