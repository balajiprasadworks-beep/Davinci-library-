/* ============================================================
   POST /api/cashfree-webhook   — Cashfree tells us a payment moved

   Body parsing is switched off (see config below) because signature
   verification needs the exact bytes Cashfree sent — re-serialising
   an already-parsed object can differ in whitespace or key order and
   break a genuine signature.

   The signature check is a courtesy, not the security boundary: this
   never trusts the webhook body's claimed status directly.
   finalizeIfPaid() always re-asks Cashfree with our own credentials
   before marking anything paid, so even a webhook whose signature
   fails to verify — for whatever reason — costs nothing worse than
   a missed fast path; the buyer's own return-to-cart.html poll is
   the backstop that still gets their order finalized.

   Always answers 200 once the event has been read, so Cashfree does
   not spend its retry budget on an event we understood but decided
   not to act on (an order that isn't ours, a status that isn't
   PAID yet).
   ============================================================ */

import * as cashfree from "./_lib/cashfree.js";
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

  if (!cashfree.isConfigured()) {
    res.status(501).end();
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];

  if (!cashfree.verifyWebhookSignature(signature, rawBody, timestamp)) {
    console.warn("cashfree webhook: signature did not verify");
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

  const ref = payload?.data?.order?.order_id;
  if (!ref) {
    res.status(200).end();
    return;
  }

  try {
    await finalizeIfPaid(String(ref));
  } catch (err) {
    console.error("cashfree webhook finalize failed", err);
    // Still 200: Cashfree retries on non-2xx, and the buyer's own
    // return-page poll will retry this same finalize independently.
  }

  res.status(200).end();
}
