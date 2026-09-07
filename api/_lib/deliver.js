/* ============================================================
   DELIVERY — the one place that turns a paid order into a buyer
   who has a working download link and knows about it.

   Called from api/razorpay-webhook.js the instant a payment is
   confirmed, and safe to call again by hand from /admin.html (a
   "resend" action) if a buyer says a link expired or an email never
   arrived — it always re-presigns fresh links rather than reuse
   whatever the order was last delivered with.
   ============================================================ */

import * as r2 from "./r2.js";
import * as mail from "./mail.js";
import { PRODUCTS } from "../../js/catalog.js";

/**
 * Presign a download link for every item that has an r2Key, and
 * email the buyer + seller. Best-effort on both: a title with no
 * r2Key, or a presign call that fails, is listed as "sending
 * separately" rather than blocking the rest of the order, and a mail
 * failure never blocks the caller's DB write, since losing the
 * record of a confirmed sale is far worse than a missed notification.
 *
 * Returns the resolved items (with fileUrl where available) so the
 * caller can log or inspect what actually went out.
 */
export async function deliver(order) {
  const resolvedItems = await Promise.all(order.items.map(async (item) => {
    const key = PRODUCTS.find((p) => p.id === item.id)?.r2Key;
    if (!key) return item;
    try {
      const fileUrl = await r2.presignDownload(key, { filename: `${item.title}.pdf` });
      return { ...item, fileUrl };
    } catch (err) {
      console.warn(`could not presign a link for ${item.id}:`, err);
      return item;
    }
  }));

  const [buyerMail, sellerMail] = await Promise.allSettled([
    mail.deliveredToBuyer(order, resolvedItems),
    mail.alertSeller(order),
  ]);
  for (const [who, result] of [["buyer", buyerMail], ["seller", sellerMail]]) {
    if (result.status === "rejected") console.error(`${who} email threw`, result.reason);
    else if (!result.value.sent) console.warn(`${who} email not sent: ${result.value.reason}`);
  }

  return resolvedItems;
}
