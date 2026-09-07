/* ============================================================
   POST /api/create-order

   Buyer clicks "Pay" on the cart page. This prices the order from
   the catalogue, records it (status='created') in Neon, asks
   Razorpay for a Payment Link, and hands the buyer's browser a URL
   to redirect to. Razorpay's webhook — not this response — is what
   later confirms the payment actually happened; see
   api/razorpay-webhook.js.

   Deliberate: if the database or Razorpay is not configured this
   returns 501 with a clear reason, and the checkout page shows that
   plainly rather than pretending a sale can happen. There is no
   "record it locally and email us the reference" fallback any more
   — see cart.html — because the whole point of this flow is that
   nothing about a sale should need the seller's manual attention.
   ============================================================ */

import { build, OrderError } from "./_lib/order.js";
import * as db from "./_lib/db.js";
import * as razorpay from "./_lib/razorpay.js";
import { json, methodIs, body } from "./_lib/http.js";

function origin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (!methodIs(req, res, "POST")) return;

  if (!db.isConfigured() || !razorpay.isConfigured()) {
    return json(res, 501, {
      error: "Checkout is not set up on this deployment yet.",
      code: "not-configured",
    });
  }

  let order;
  try {
    order = build(body(req));
  } catch (err) {
    if (err instanceof OrderError) {
      return json(res, 400, { error: err.message, field: err.field });
    }
    throw err;
  }

  try {
    await db.createOrder(order);
  } catch (err) {
    console.error("order insert failed", err);
    return json(res, 502, {
      error: "We could not record your order. Nothing was charged — please try again.",
      code: "store-failed",
    });
  }

  let link;
  try {
    link = await razorpay.createPaymentLink({
      // Rupees -> paise. Prices in the catalogue are always whole
      // rupees, so this is exact — Math.round is cheap insurance,
      // not a sign anything fractional is expected here.
      amountPaise: Math.round(order.total * 100),
      ref: order.ref,
      email: order.email,
      description: order.items.map((i) => i.title).join(", ").slice(0, 250),
      callbackUrl: `${origin(req)}/order.html?ref=${order.ref}`,
    });
  } catch (err) {
    console.error("razorpay payment link failed", err);
    await db.setStatus(order.ref, "failed").catch(() => {});
    return json(res, 502, {
      error: "We could not start payment. Nothing was charged — please try again.",
      code: "razorpay-failed",
    });
  }

  await db.attachPaymentLink(order.ref, link.id);

  return json(res, 201, {
    ref: order.ref,
    total: order.total,
    items: order.items,
    email: order.email,
    payUrl: link.short_url,
  });
}
