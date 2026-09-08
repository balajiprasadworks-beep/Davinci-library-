/* ============================================================
   DELIVERY — resolve each item's file link and email the buyer.

   Shared by two triggers: the seller clicking "mark delivered" for
   a manual QR order, and Cashfree confirming a gateway payment
   automatically. Both must behave identically, so this is the one
   place that does it.
   ============================================================ */

import * as blob from "./blob.js";
import * as mail from "./mail.js";
import { PRODUCTS } from "../../js/catalog.js";

/**
 * Resolve a fresh presigned link for each item that has a blobPath,
 * independently per item — one bad pathname or a slow Blob API must
 * never block the rest of the order — then email the buyer.
 */
export async function deliver(order) {
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

  return mail.deliveredToBuyer(order, resolvedItems).catch((e) => ({ sent: false, reason: String(e) }));
}
