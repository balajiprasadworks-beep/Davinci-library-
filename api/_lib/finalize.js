/* ============================================================
   FINALIZE A RAZORPAY ORDER — the one place that turns "Razorpay
   says this got paid" into "the buyer has their notes."

   Called from two places, both of which must be safe to call more
   than once for the same order:
     - /api/razorpay-webhook, the backstop path
     - /api/razorpay-verify, called right after Checkout's handler
       function reports success in the buyer's own browser — usually
       what actually resolves the order, since it fires in the same
       page view the buyer is already waiting on
   Whichever of the two is slow, lost, or fails signature verification
   for a reason unrelated to whether the payment actually went
   through, the other still finalizes the order.

   Never trusts a webhook body's or a checkout callback's claimed
   status directly — always re-asks Razorpay itself, with our own
   credentials, before treating an order as paid. A forged or
   replayed webhook/callback can at worst cause one extra read-only
   API call; it can never mark an order delivered on its own say-so.
   ============================================================ */

import * as store from "./store.js";
import * as razorpay from "./razorpay.js";
import { deliver } from "./deliver.js";

/**
 * @returns {Promise<{status: string, notified?: boolean}>}
 */
export async function finalizeIfPaid(ref) {
  const order = await store.get(ref);
  if (!order || order.provider !== "razorpay") return { status: "unknown" };

  // Already resolved one way or another — nothing left to do. This is
  // what makes calling this twice (or from two different triggers)
  // for the same payment harmless.
  if (order.status !== "awaiting-payment") return { status: order.status };

  // The webhook and /api/razorpay-verify can both land within moments
  // of each other — sometimes closer together than one Razorpay API
  // round trip. Without this, both could read "awaiting-payment"
  // before either had written "delivered" back, and the buyer would
  // get two identical delivery emails. Whichever caller loses the
  // lock just backs off; it isn't an error, the other one has this.
  if (!(await store.tryLock(`davinci:finalize:${ref}`, 30))) {
    return { status: order.status };
  }

  // Re-read: whoever held the lock before us may have already
  // finished the whole thing while we were waiting for it.
  const fresh = await store.get(ref);
  if (fresh.status !== "awaiting-payment") return { status: fresh.status };

  const paid = await razorpay.isOrderPaid(fresh.gatewayOrderId);
  if (!paid) return { status: fresh.status };

  fresh.status = "delivered";
  fresh.updatedAt = new Date().toISOString();
  await store.save(fresh);

  const result = await deliver(fresh);
  if (!result.sent) console.warn("delivery email not sent:", result.reason);
  return { status: "delivered", notified: result.sent };
}
