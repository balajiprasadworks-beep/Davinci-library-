/* ============================================================
   ORDER CONSTRUCTION AND VALIDATION

   The browser sends product ids and nothing else. Titles and
   prices are read from the catalogue on the server, so a tampered
   client cannot invent a ₹1 order — the total the seller sees is
   always the total the catalogue says.

   The catalogue module is plain data with no DOM access, so the
   same file the page renders from is the file this imports.
   ============================================================ */

import { PRODUCTS, isBuyable } from "../../js/catalog.js";

const MAX_ITEMS = 40;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Strip control characters and clamp, so nothing odd reaches an inbox.
 *  Only C0 and DEL go: hyphens and spaces are legitimate in both UPI
 *  references and email local parts. Written as escapes on purpose --
 *  literal control characters in source are invisible and easily lost. */
const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

/** Short, human-readable, unambiguous when read down a phone line. */
function reference() {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY3479";  // no O/0, I/1, S/5, B/8
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `DV-${out}`;
}

export class OrderError extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
  }
}

/**
 * Turn a request body into an order, or throw OrderError.
 * @param {{ids?: unknown, email?: unknown, txnId?: unknown}} body
 */
export function build(body) {
  const email = clean(body?.email, 254).toLowerCase();
  if (!EMAIL.test(email)) {
    throw new OrderError("Enter the email address your notes should go to.", "email");
  }

  const txnId = clean(body?.txnId, 64);
  if (txnId.length < 4) {
    throw new OrderError("Enter the reference your UPI app showed after payment.", "txnId");
  }

  if (!Array.isArray(body?.ids) || body.ids.length === 0) {
    throw new OrderError("Your cart is empty.", "ids");
  }
  if (body.ids.length > MAX_ITEMS) {
    throw new OrderError("That is more titles than we sell.", "ids");
  }

  const wanted = [...new Set(body.ids.map((id) => clean(id, 64)))];
  const items = [];
  for (const id of wanted) {
    const product = PRODUCTS.find((p) => p.id === id);
    if (!product) throw new OrderError(`Unknown title: ${id}`, "ids");
    if (!isBuyable(product)) {
      throw new OrderError(`${product.title} is not on sale yet.`, "ids");
    }
    items.push({ id: product.id, title: product.title, price: product.price });
  }

  return {
    ref: reference(),
    placedAt: new Date().toISOString(),
    email,
    txnId,
    status: "awaiting-payment-check",
    // Authoritative: summed from the catalogue, never from the client.
    total: items.reduce((sum, i) => sum + i.price, 0),
    items,
  };
}

export const STATUSES = ["awaiting-payment-check", "delivered", "refunded", "cancelled"];
