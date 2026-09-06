/* ============================================================
   CART — localStorage-backed, single source of truth.
   Notes are digital, so quantity is always 1 per title.
   ============================================================ */

import { byId } from "./catalog.js";

const KEY = "davinci.cart.v1";
const ORDERS_KEY = "davinci.orders.v1";
const PROFILE_KEY = "davinci.profile.v1";

const listeners = new Set();

/* ---------- safe storage (private mode / blocked cookies) ---------- */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — cart still works for this page view */
  }
}

/* ---------- cart ---------- */

let ids = read(KEY, []);

function commit() {
  write(KEY, ids);
  listeners.forEach((fn) => fn(items(), count()));
}

/** Product objects currently in the cart (skips ids no longer in the catalog). */
export function items() {
  return ids.map(byId).filter(Boolean);
}

export function count() {
  return items().length;
}

export function has(id) {
  return ids.includes(id);
}

export function add(id) {
  if (!byId(id) || ids.includes(id)) return false;
  ids = [...ids, id];
  commit();
  return true;
}

export function remove(id) {
  if (!ids.includes(id)) return false;
  ids = ids.filter((x) => x !== id);
  commit();
  return true;
}

/** Add if absent, remove if present. Returns true when the item ends up in the cart. */
export function toggle(id) {
  return has(id) ? (remove(id), false) : (add(id), true);
}

export function clear() {
  ids = [];
  commit();
}

export function subtotal() {
  return items().reduce((sum, p) => sum + p.price, 0);
}

export function savings() {
  return items().reduce((sum, p) => sum + (p.was ? p.was - p.price : 0), 0);
}

/** Subscribe to cart changes. Fires immediately with current state. */
export function onChange(fn) {
  listeners.add(fn);
  fn(items(), count());
  return () => listeners.delete(fn);
}

/* Keep tabs in sync. */
addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  ids = read(KEY, []);
  listeners.forEach((fn) => fn(items(), count()));
});

/* ---------- orders ---------- */

export function orders() {
  return read(ORDERS_KEY, []);
}

/**
 * Record a placed order locally so the buyer can see it on their dashboard
 * while manual (QR) payment is confirmed out of band.
 */
export function placeOrder({ email, txnId }) {
  const order = {
    ref: "DV" + Date.now().toString(36).toUpperCase().slice(-7),
    placedAt: new Date().toISOString(),
    email,
    txnId,
    status: "awaiting-confirmation",
    total: subtotal(),
    items: items().map(({ id, title, price }) => ({ id, title, price })),
  };
  write(ORDERS_KEY, [order, ...orders()]);
  clear();
  return order;
}

/* ---------- profile ---------- */

export function profile() {
  return read(PROFILE_KEY, { name: "", email: "", stage: "", exam: "" });
}

export function saveProfile(data) {
  write(PROFILE_KEY, { ...profile(), ...data });
}
