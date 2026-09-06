/* ============================================================
   GET /api/health

   Answers "did my environment variables actually land?" without
   making you guess from a failing checkout.

   Public callers get booleans only — which subsystems are wired,
   never a value, a hostname or a key. Presence flags are not
   sensitive, and being able to check them without a token is the
   whole point when the token itself is what you got wrong.

   With a valid admin token it also round-trips a probe key through
   Redis, because "configured" and "reachable" are different
   problems and a wrong token in the URL looks exactly like a
   working one until you write something.
   ============================================================ */

import * as store from "./_lib/store.js";
import { canSend, seller } from "./_lib/mail.js";
import { json, methodIs, isAdmin } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "GET")) return;

  const env = (name) => Boolean(process.env[name]);

  const report = {
    store: {
      configured: store.isConfigured(),
      UPSTASH_REDIS_REST_URL: env("UPSTASH_REDIS_REST_URL"),
      UPSTASH_REDIS_REST_TOKEN: env("UPSTASH_REDIS_REST_TOKEN"),
    },
    mail: {
      configured: canSend(),
      RESEND_API_KEY: env("RESEND_API_KEY"),
      SELLER_EMAIL: Boolean(seller()),
      MAIL_FROM: env("MAIL_FROM"),
    },
    admin: {
      configured: env("ADMIN_TOKEN"),
      tokenAccepted: isAdmin(req),
    },
  };

  // Orders are recorded with the store alone; mail only affects notification.
  report.ordersRecorded = report.store.configured;

  if (report.admin.tokenAccepted && report.store.configured) {
    const started = Date.now();
    try {
      report.store.roundTrip = { ok: await store.probe(), ms: Date.now() - started };
    } catch (err) {
      report.store.roundTrip = { ok: false, error: String(err.message ?? err) };
    }
  }

  return json(res, 200, report);
}
