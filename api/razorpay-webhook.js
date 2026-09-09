/* ============================================================
   POST /api/razorpay-webhook   — Razorpay tells us an order was paid

   Subscribe this URL to the "order.paid" event only (Razorpay
   dashboard -> Settings -> Webhooks). That event's payload carries
   payload.order.entity.receipt, which is our own order ref, set at
   creation time (see _lib/razorpay.js's createOrder) — so no extra
   lookup is needed to map the webhook back to one of our orders.

   Body parsing is switched off (see config below): signature
   verification needs the exact bytes Razorpay sent — re-serialising
   an already-parsed object can differ in whitespace or key order and
   break a genuine signature.

   The signature check is a courtesy, not the security boundary:
   finalizeIfPaid() always re-asks Razorpay's Orders API directly
   with our own credentials before marking anything paid, so even a
   webhook whose signature fails to verify costs nothing worse than a
   missed fast path. In practice /api/razorpay-verify — fired from
   the buyer's own browser the moment Checkout's handler reports
   success — is what usually resolves the order; this webhook is the
   backstop for whenever that never fires (closed tab, JS error, ad
   blocker).

   Always answers 200 once the event has been read, so Razorpay does
   not spend its retry budget on an event we understood but decided
   not to act on (an order that isn't ours, or an event that arrives
   before the order is actually paid).
   ============================================================ */

import * as razorpay from "./_lib/razorpay.js";
import { finalizeIfPaid } from "./_lib/finalize.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString("utf8");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  if (!razorpay.isConfigured() || !process.env.RAZORPAY_WEBHOOK_SECRET) {
    res.status(501).end();
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-razorpay-signature"];

  if (!razorpay.verifyWebhookSignature(signature, rawBody)) {
    console.warn("razorpay webhook: signature did not verify");
    res.status(401).end();
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).end();
    return;
  }

  const ref = payload?.payload?.order?.entity?.receipt;
  if (!ref) {
    res.status(200).end();
    return;
  }

  try {
    await finalizeIfPaid(String(ref));
  } catch (err) {
    console.error("razorpay webhook finalize failed", err);
    // Still 200: Razorpay retries on non-2xx, and /api/razorpay-verify
    // (or a later admin check) can still resolve this independently.
  }

  res.status(200).end();
}
