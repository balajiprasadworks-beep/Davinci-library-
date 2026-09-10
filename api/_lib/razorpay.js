/* ============================================================
   RAZORPAY — Payment Links + webhook verification.

   Payment Links (not raw Orders + Checkout.js) on purpose: this is
   a plain static site with no bundler, so the simplest integration
   that needs no client-side SDK at all is to create a Link server-
   side and send the buyer's browser straight to it. Razorpay's own
   hosted page collects the payment; this backend never touches a
   card number or UPI PIN.

   Set in Vercel (Settings -> Environment Variables):
     RAZORPAY_KEY_ID          Razorpay dashboard -> Settings -> API Keys
     RAZORPAY_KEY_SECRET      shown once, when that key pair is generated
     RAZORPAY_WEBHOOK_SECRET  Settings -> Webhooks -> Add New Webhook ->
                               set a secret there, and put the SAME
                               string here. Not the API secret — a
                               separate value you choose yourself.

   Start in Razorpay's TEST mode (test key pair, test cards/UPI) until
   the whole loop — pay, webhook, email, download — works end to end,
   then switch the two API key variables to a live key pair.
   ============================================================ */

import { createHmac, timingSafeEqual } from "node:crypto";

const keyId = () => process.env.RAZORPAY_KEY_ID;
const keySecret = () => process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = () => process.env.RAZORPAY_WEBHOOK_SECRET;

export const isConfigured = () => Boolean(keyId() && keySecret());
export const webhookConfigured = () => Boolean(webhookSecret());

/**
 * Create a Payment Link for one order. `amountPaise` is computed by
 * the caller from the catalogue, in paise (INR's smallest unit) —
 * never trust a client-supplied amount for anything that charges money.
 */
export async function createPaymentLink({ amountPaise, ref, email, description, callbackUrl }) {
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${keyId()}:${keySecret()}`).toString("base64"),
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      description,
      customer: { email },
      notify: { email: true, sms: false },
      reminder_enable: true,
      reference_id: ref,
      callback_url: callbackUrl,
      callback_method: "get",
      notes: { ref },
    }),
  });

  if (!res.ok) {
    throw new Error(`Razorpay payment link create failed: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { id: "plink_...", short_url, ... }
}

/**
 * Verify the X-Razorpay-Signature header on an incoming webhook call.
 * `rawBody` MUST be the exact bytes Razorpay signed — never a
 * re-serialised JSON.parse(...)-then-stringify(...), which is not
 * guaranteed to be byte-identical and would break every signature.
 * Constant-time comparison so a timing attack can't be used to guess
 * the signature byte by byte.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !webhookSecret()) return false;
  const expected = createHmac("sha256", webhookSecret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signatureHeader), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
