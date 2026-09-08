/* ============================================================
   FINALIZE A CASHFREE ORDER — the one place that turns "Cashfree
   says this got paid" into "the buyer has their notes."

   Called from two places, both of which must be safe to call more
   than once for the same order:
     - the Cashfree webhook, the fast path (usually seconds)
     - the buyer's own browser polling after the checkout redirect,
       a backstop in case the webhook is slow, lost, or its
       signature fails to verify for a reason unrelated to whether
       the payment actually went through

   Never trusts a webhook body's claimed status directly — always
   re-asks Cashfree with our own credentials before treating an order
   as paid. A forged or replayed webhook can at worst cause one extra
   read-only API call; it can never mark an order delivered on its
   own say-so.
   ============================================================ */

import * as store from "./store.js";
import * as cashfree from "./cashfree.js";
import { deliver } from "./deliver.js";

/**
 * @returns {Promise<{status: string, notified?: boolean}>}
 */
export async function finalizeIfPaid(ref) {
  const order = await store.get(ref);
  if (!order || order.provider !== "cashfree") return { status: "unknown" };

  // Already resolved one way or another — nothing left to do. This is
  // what makes calling this twice for the same payment harmless.
  if (order.status !== "awaiting-payment") return { status: order.status };

  // The webhook and the buyer's own return-page poll can both land within
  // moments of each other — sometimes closer together than one Cashfree
  // API round trip. Without this, both could read "awaiting-payment"
  // before either had written "delivered" back, and the buyer would get
  // two identical delivery emails. Whichever caller loses the lock just
  // backs off; it isn't an error, the other one has this.
  if (!(await store.tryLock(`davinci:finalize:${ref}`, 30))) {
    return { status: order.status };
  }

  // Re-read: whoever held the lock before us may have already finished
  // the whole thing while we were waiting for it.
  const fresh = await store.get(ref);
  if (fresh.status !== "awaiting-payment") return { status: fresh.status };

  const cfOrder = await cashfree.fetchOrder(ref);
  if (cfOrder.order_status !== "PAID") return { status: fresh.status };

  fresh.status = "delivered";
  fresh.updatedAt = new Date().toISOString();
  await store.save(fresh);

  const result = await deliver(fresh);
  if (!result.sent) console.warn("delivery email not sent:", result.reason);
  return { status: "delivered", notified: result.sent };
}
