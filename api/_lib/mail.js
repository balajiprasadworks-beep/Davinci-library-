/* ============================================================
   EMAIL

   Sends through Resend's REST API. Optional: with no API key the
   functions still record orders and simply report that no mail
   went out, because losing the order is far worse than losing the
   notification.

   Set in Vercel (Settings -> Environment Variables):
     RESEND_API_KEY
     MAIL_FROM     e.g. "DaVinci's Medical Library <orders@yourdomain>"
     SELLER_EMAIL  where new-order alerts land

   Note: Resend will only deliver to arbitrary addresses once you
   verify a sending domain. Until then MAIL_FROM must be
   onboarding@resend.dev, which can only send to your own address —
   fine for the seller alert, not for buyer receipts.
   ============================================================ */

/* Read per call, not at import — see the note in store.js. */
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

/** The one that matters: without it you would not know a sale happened. */
export function alertSeller(order) {
  return send({
    to: seller(),
    replyTo: order.email,
    subject: `New order ${order.ref} — ${money(order.total)}`,
    text: [
      `${order.ref}`,
      ``,
      lines(order),
      ``,
      `Total:          ${money(order.total)}`,
      `UPI reference:  ${order.txnId}`,
      `Deliver to:     ${order.email}`,
      `Placed:         ${order.placedAt}`,
      ``,
      `Check the payment landed, then send the files and mark it`,
      `delivered on the admin page.`,
    ].join("\n"),
  });
}

/** Reassures the buyer that the money did not vanish into nothing. */
export function receiptToBuyer(order) {
  return send({
    to: order.email,
    replyTo: seller() || undefined,
    subject: `Order ${order.ref} received`,
    text: [
      `Thanks — your order is recorded.`,
      ``,
      lines(order),
      ``,
      `Total:          ${money(order.total)}`,
      `UPI reference:  ${order.txnId}`,
      `Reference:      ${order.ref}`,
      ``,
      `We verify the payment by hand, so your notes arrive within 12`,
      `hours rather than instantly. Reply to this email if anything`,
      `looks wrong, quoting ${order.ref}.`,
    ].join("\n"),
  });
}

/** Sent when the seller marks the order delivered. */
export function deliveredToBuyer(order) {
  return send({
    to: order.email,
    replyTo: seller() || undefined,
    subject: `Order ${order.ref} — your notes are on the way`,
    text: [
      `Your notes have been sent.`,
      ``,
      lines(order),
      ``,
      `If they have not reached you, reply quoting ${order.ref}.`,
    ].join("\n"),
  });
}
