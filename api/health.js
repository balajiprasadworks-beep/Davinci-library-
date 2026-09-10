/* ============================================================
   GET /api/health

   Answers "did my environment variables actually land?" without
   making you guess from a failing checkout.

   Public callers get booleans only — which subsystems are wired,
   never a value, a hostname or a key. Presence flags are not
   sensitive, and being able to check them without a token is the
   whole point when the token itself is what you got wrong.

   With a valid admin token it also round-trips a probe query
   through Neon, because "configured" and "reachable" are different
   problems and a wrong connection string looks exactly like a
   working one until you actually query it.
   ============================================================ */

import * as db from "./_lib/db.js";
import * as blob from "./_lib/blob.js";
import * as razorpay from "./_lib/razorpay.js";
import { canSend, seller } from "./_lib/mail.js";
import { PRODUCTS } from "../js/catalog.js";
import { json, methodIs, isAdmin } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!methodIs(req, res, "GET")) return;

  const env = (name) => Boolean(process.env[name]);

  const report = {
    db: {
      configured: db.isConfigured(),
      DATABASE_URL: env("DATABASE_URL"),
    },
    payment: {
      configured: razorpay.isConfigured(),
      RAZORPAY_KEY_ID: env("RAZORPAY_KEY_ID"),
      RAZORPAY_KEY_SECRET: env("RAZORPAY_KEY_SECRET"),
      webhookConfigured: razorpay.webhookConfigured(),
      RAZORPAY_WEBHOOK_SECRET: env("RAZORPAY_WEBHOOK_SECRET"),
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
    fileDelivery: {
      configured: blob.isConfigured(),
      BLOB_READ_WRITE_TOKEN: env("BLOB_READ_WRITE_TOKEN"),
      // How many catalogue titles actually have a blobPath yet — the
      // store being connected doesn't mean anything has been uploaded.
      titlesLinked: PRODUCTS.filter((p) => p.blobPath).length,
      titlesTotal: PRODUCTS.length,
    },
  };

  // Checkout can only go end to end once payment and the database are
  // both wired. File delivery missing is a lesser, per-title gap (an
  // order still records and pays; only the auto-download link is
  // absent) so it is reported separately, not folded into this flag.
  report.checkoutReady = report.db.configured && report.payment.configured;

  if (report.admin.tokenAccepted && report.db.configured) {
    const started = Date.now();
    try {
      report.db.roundTrip = { ok: await db.probe(), ms: Date.now() - started };
    } catch (err) {
      report.db.roundTrip = { ok: false, error: String(err.message ?? err) };
    }
  }

  return json(res, 200, report);
}
