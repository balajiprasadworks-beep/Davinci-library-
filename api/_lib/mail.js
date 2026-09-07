/* ============================================================
   EMAIL

   Sends through Resend's REST API. Optional: with no API key the
   functions still report that no mail went out rather than throw,
   because a payment that Razorpay already confirmed must never be
   lost or blocked by a notification failing to send.

   Set in Vercel (Settings -> Environment Variables):
     RESEND_API_KEY
     MAIL_FROM     e.g. "DaVinci's Medical Library <orders@yourdomain>"
     SELLER_EMAIL  where sale alerts land

   Note: Resend will only deliver to arbitrary addresses once you
   verify a sending domain. Until then MAIL_FROM must be
   onboarding@resend.dev, which can only send to your own address —
   fine for the seller alert, not for buyer receipts. Verifying a
   domain (Resend dashboard -> Domains) is a five-minute DNS step and
   is required before real buyers can be emailed their notes.
   ============================================================ */

/* Read per call, not at import — see the note in db.js. */
const apiKey = () => process.env.RESEND_API_KEY;
const from = () => process.env.MAIL_FROM || "onboarding@resend.dev";
export const seller = () => process.env.SELLER_EMAIL || "";

export const canSend = () => Boolean(apiKey());

async function send({ to, subject, text, replyTo }) {
  if (!apiKey()) return { sent: false, reason: "RESEND_API_KEY not set" };
  if (!to) return { sent: false, reason: "no recipient" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from(),
      to: [to],
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) return { sent: false, reason: `resend ${res.status}: ${await res.text()}` };
  return { sent: true };
}

const money = (n) => "₹" + n.toLocaleString("en-IN");
const lines = (order) => order.items.map((i) => `  ${i.title} — ${money(i.price)}`).join("\n");

/** Fires once Razorpay's webhook confirms a payment — the one seller
 *  email that matters, since without it you would not know a sale
 *  happened. Delivery already ran by the time this sends. */
export function alertSeller(order) {
  return send({
    to: seller(),
    replyTo: order.email,
    subject: `Sale — ${order.ref} — ${money(order.total)}`,
    text: [
      `${order.ref}`,
      ``,
      lines(order),
      ``,
      `Total:               ${money(order.total)}`,
      `Razorpay payment id: ${order.razorpay_payment_id ?? "(pending)"}`,
      `Buyer:               ${order.email}`,
      `Placed:              ${order.placed_at}`,
      ``,
      `Payment confirmed by Razorpay's webhook and the notes were sent`,
      `automatically — nothing needed from you. Reply to this email to`,
      `reach the buyer directly if there's a support question.`,
    ].join("\n"),
  });
}

/**
 * Sent once Razorpay's webhook confirms payment and delivery has run.
 * This is the buyer's first and only transactional email — there is
 * no separate "order placed" receipt, since nothing is actually
 * theirs to receive until the payment clears.
 *
 * `resolvedItems` is order.items with a `fileUrl` merged in wherever
 * a link could be presigned. A title with no fileUrl — nothing
 * uploaded yet, or the presign call failed — falls back to a line
 * saying it's on its way separately, so the email is never wrong,
 * only ever less complete.
 */
export function deliveredToBuyer(order, resolvedItems = order.items) {
  const withLink = resolvedItems.filter((i) => i.fileUrl);
  const withoutLink = resolvedItems.filter((i) => !i.fileUrl);

  const body = [
    `Payment received — thank you! Order ${order.ref}, ${money(order.total)}.`,
    ``,
    withLink.length
      ? `Your notes are ready to download:\n\n` +
        withLink.map((i) => `  ${i.title}\n  ${i.fileUrl}`).join("\n\n") +
        `\n\nThese links expire in 7 days — reply quoting ${order.ref} if you need a fresh one after that.`
      : null,
    withoutLink.length
      ? (withLink.length ? `\n` : ``) +
        `Sending separately:\n` +
        withoutLink.map((i) => `  ${i.title}`).join("\n")
      : null,
    ``,
    `Please don't share these links around — if anything doesn't open,`,
    `reply quoting ${order.ref}.`,
  ].filter((x) => x !== null);

  return send({
    to: order.email,
    replyTo: seller() || undefined,
    subject: `Order ${order.ref} — your notes are ready`,
    text: body.join("\n"),
  });
}
