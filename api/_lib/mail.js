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

/**
 * Sent when the seller marks the order delivered.
 *
 * `resolvedItems` is order.items with a `fileUrl` merged in wherever the
 * catalogue has one (order-status.js resolves this, since order.items is
 * a frozen snapshot from checkout and never carries delivery links). A
 * title with no fileUrl yet — nothing uploaded, or an older order placed
 * before this existed — falls back to a line saying it's on its way
 * separately, so the email is never wrong, only ever less complete.
 */
export function deliveredToBuyer(order, resolvedItems = order.items) {
  const withLink = resolvedItems.filter((i) => i.fileUrl);
  const withoutLink = resolvedItems.filter((i) => !i.fileUrl);

  const body = [
    withLink.length
      ? `Your notes are ready to download:\n\n` +
        withLink.map((i) => `  ${i.title}\n  ${i.fileUrl}`).join("\n\n")
      : null,
    withoutLink.length
      ? (withLink.length ? `\n` : ``) +
        `Sending separately:\n` +
        withoutLink.map((i) => `  ${i.title}`).join("\n")
      : null,
    ``,
    `These links aren't linked from anywhere public — please don't share`,
    `them around. If anything doesn't open, reply quoting ${order.ref}.`,
  ].filter((x) => x !== null);

  return send({
    to: order.email,
    replyTo: seller() || undefined,
    subject: `Order ${order.ref} — your notes are ready`,
    text: body.join("\n"),
  });
}
