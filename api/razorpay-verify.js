/* ============================================================
   POST /api/razorpay-verify

   Called once, right after Razorpay Checkout's handler function
   reports success in the buyer's browser (see cart.html). Standard
   Checkout is a modal, not a redirect — the buyer never leaves
   cart.html — so this is checked synchronously in the same request
   the buyer is already waiting on, with the result rendered straight
   into the page. It is the fast path; /api/razorpay-webhook is the
   backstop for whenever this never fires at all.

   The {razorpay_order_id, razorpay_payment_id, razorpay_signature}
   triple only proves Razorpay signed that specific pair — it is a
   fast, cheap check, not the security boundary. finalizeIfPaid()
   still re-asks Razorpay's Orders API directly with our own
   credentials before treating anything as paid, exactly like the
   webhook path (see _lib/finalize.js). The signature check here just
   means a tampered or malformed triple never even reaches that call.

   order_id is also checked against the one this ref's own order
   actually opened with Razorpay (order.gatewayOrderId) — otherwise a
   genuinely valid signature from a *different*, already-paid order
   could be replayed against this endpoint to try to mark some other
   (possibly costlier) ref as paid.

   The webhook (/api/razorpay-webhook) remains the backstop for a
   buyer who closes the tab before this ever fires.
   ============================================================ */

import * as store from "./_lib/store.js";
import * as razorpay from "./_lib/razorpay.js";
import { finalizeIfPaid } from "./_lib/finalize.js";
import { json, methodIs, body } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;

  if (!razorpay.isConfigured()) {
    return json(res, 501, { error: "Card/UPI checkout is not configured on this deployment.", code: "no-gateway" });
  }

  const { ref, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body(req);
  if (!ref || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return json(res, 400, { error: "Incomplete payment confirmation." });
  }

  try {
    const order = await store.get(String(ref));
    if (!order || order.provider !== "razorpay") {
      return json(res, 404, { error: `No order ${ref}.` });
    }

    if (order.gatewayOrderId !== razorpay_order_id) {
      console.warn("razorpay-verify: order id mismatch", { ref, expected: order.gatewayOrderId, got: razorpay_order_id });
      return json(res, 400, { error: "This confirmation does not match that order." });
    }

    const signatureOk = razorpay.verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!signatureOk) {
      console.warn("razorpay-verify: signature did not verify", { ref });
      return json(res, 400, { error: "Could not verify that payment." });
    }

    const result = await finalizeIfPaid(String(ref));
    return json(res, 200, { ref, status: result.status });
  } catch (err) {
    console.error("razorpay verify failed", err);
    return json(res, 502, { error: "Could not confirm that payment." });
  }
}
