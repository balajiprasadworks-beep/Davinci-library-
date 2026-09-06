/* ============================================================
   Shared HTTP plumbing for the API functions.
   ============================================================ */

import { createHash, timingSafeEqual } from "node:crypto";

export function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // These are private, per-request answers — never let a CDN hold one.
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

/** Reject anything but the expected verb, and advertise what is allowed. */
export function methodIs(req, res, method) {
  if (req.method === method) return true;
  res.setHeader("Allow", method);
  json(res, 405, { error: `Use ${method}.` });
  return false;
}

/** Vercel parses JSON bodies, but a hand-rolled request may send a string. */
export function body(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body ?? {};
}

/**
 * Admin check for the seller-only endpoints.
 *
 * Digests both sides before comparing so the comparison is constant time
 * and length-independent — a raw === on secrets leaks their length and
 * their prefix through timing.
 */
export function isAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;                 // unset means locked, not open

  const header = req.headers?.authorization ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied) return false;

  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.setHeader("WWW-Authenticate", "Bearer");
  json(res, 401, {
    error: process.env.ADMIN_TOKEN
      ? "Bad admin token."
      : "ADMIN_TOKEN is not set on the server, so the admin API is disabled.",
  });
  return false;
}
