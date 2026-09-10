/**
 * Tests for the order/payment API that don't need live credentials.
 *
 *   node tools/check-api.mjs
 *
 * What this can and can't cover: order.build() (pricing/validation) and
 * razorpay.verifyWebhookSignature() are pure functions, fully tested here.
 * mail.js talks to Resend over plain fetch, so it's stubbed the same way
 * the old Redis-backed suite stubbed Upstash. Neon (db.js) and Vercel Blob
 * (blob.js) use their own SDKs rather than raw fetch, so their network
 * calls are NOT stubbed here — instead, the handler tests below check
 * what's true regardless of credentials: an unconfigured deployment fails
 * with a clear 501 rather than crashing, and the webhook verifies its
 * signature BEFORE touching the database at all, so a forged request never
 * reaches Neon or Blob no matter what is or isn't configured. The actual pay ->
 * webhook -> deliver loop needs a real end-to-end check against Razorpay
 * test mode; see the README.
 *
 * Exits non-zero if anything failed, so it drops into CI beside
 * tools/check.mjs.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push([true, name]);
  } catch (err) {
    results.push([false, `${name}\n     ${err.message.split("\n")[0]}`]);
  }
}

/* A fake Vercel res object. */
function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    payload: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.payload = JSON.parse(b); return this; },
  };
}

/** A real Readable stream standing in for the webhook's raw request body —
 *  api/razorpay-webhook.js consumes req as a stream (see readRawBody), not
 *  a parsed req.body, so this needs genuine .on('data'/'end') behaviour
 *  rather than a hand-rolled fake. */
function mockRawReq(bodyBuffer, headers = {}) {
  const req = Readable.from([bodyBuffer]);
  req.method = "POST";
  req.headers = headers;
  return req;
}

/* Stand in for Resend only — db.js/blob.js talk to Neon/Vercel Blob via
   their own SDKs, not raw fetch, so they are deliberately not exercised
   here. */
function stubMailFetch() {
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("resend.com")) {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ id: "stub" }) };
    }
    throw new Error(`unstubbed fetch to ${url}`);
  };
  return { sent };
}

/** Temporarily delete some env vars; returns a function that restores
 *  exactly what was there before (including "was absent"). */
function withoutEnv(...names) {
  const had = names.map((n) => [n, process.env[n]]);
  for (const n of names) delete process.env[n];
  return () => { for (const [n, v] of had) { if (v === undefined) delete process.env[n]; else process.env[n] = v; } };
}

/* ---------------- order.build(): pricing and validation ---------------- */

const { build, OrderError } = await import("../api/_lib/order.js");
const { PRODUCTS, isBuyable } = await import("../js/catalog.js");
const real = PRODUCTS[0];
const valid = { ids: [real.id], email: "Student@Example.COM " };

await test("prices come from the catalogue, not the request", () => {
  const order = build(valid);
  assert.equal(order.total, real.price);
  assert.equal(order.items[0].title, real.title);
});

await test("a client-supplied price is ignored entirely", () => {
  const order = build({ ...valid, items: [{ id: real.id, price: 1 }], total: 1 });
  assert.equal(order.total, real.price, "server must not honour a client total");
});

await test("email is normalised", () => {
  assert.equal(build(valid).email, "student@example.com");
});

await test("duplicate ids collapse to one line", () => {
  const order = build({ ...valid, ids: [real.id, real.id, real.id] });
  assert.equal(order.items.length, 1);
  assert.equal(order.total, real.price);
});

await test("multi-item total is the sum of catalogue prices", () => {
  const three = PRODUCTS.slice(0, 3);
  const order = build({ ...valid, ids: three.map((p) => p.id) });
  assert.equal(order.total, three.reduce((s, p) => s + p.price, 0));
});

await test("unknown product id is rejected", () => {
  assert.throws(() => build({ ...valid, ids: ["not-a-real-note"] }), OrderError);
});

await test("bad email is rejected", () => {
  assert.throws(() => build({ ...valid, email: "nope" }), (e) => e.field === "email");
});

await test("empty cart is rejected", () => {
  assert.throws(() => build({ ...valid, ids: [] }), (e) => e.field === "ids");
});

await test("absurdly large cart is rejected", () => {
  assert.throws(() => build({ ...valid, ids: Array(99).fill(real.id) }), (e) => e.field === "ids");
});

await test("hyphenated ids and emails survive cleaning intact", () => {
  const order = build({ ids: ["abroad-amc1-gastroenterology"], email: "a-name@my-domain.com" });
  assert.equal(order.items[0].id, "abroad-amc1-gastroenterology");
  assert.equal(order.email, "a-name@my-domain.com");
});

await test("references are unique across many orders", () => {
  const refs = new Set(Array.from({ length: 500 }, () => build(valid).ref));
  assert.ok(refs.size > 495, `expected near-unique refs, got ${refs.size}/500`);
});

await test("the server refuses to price a title that is not on sale", () => {
  const soon = PRODUCTS.find((p) => !isBuyable(p));
  assert.ok(soon, "expected at least one unfinished title to test against");
  assert.throws(() => build({ ...valid, ids: [soon.id] }), (e) => e.field === "ids" && /not on sale/.test(e.message));
});

await test("an unfinished title cannot be smuggled in beside a live one", () => {
  const live = PRODUCTS.find(isBuyable);
  const soon = PRODUCTS.find((p) => !isBuyable(p));
  assert.throws(() => build({ ...valid, ids: [live.id, soon.id] }), OrderError);
});

/* ---------------- razorpay webhook signature verification ---------------- */

const razorpay = await import("../api/_lib/razorpay.js");

await test("valid webhook signature is accepted", () => {
  const restore = withoutEnv("RAZORPAY_WEBHOOK_SECRET");
  process.env.RAZORPAY_WEBHOOK_SECRET = "test_secret";
  const body = Buffer.from(JSON.stringify({ event: "payment_link.paid" }));
  const sig = createHmac("sha256", "test_secret").update(body).digest("hex");
  assert.equal(razorpay.verifyWebhookSignature(body, sig), true);
  restore();
});

await test("forged, tampered and missing signatures are all rejected", () => {
  const restore = withoutEnv("RAZORPAY_WEBHOOK_SECRET");
  process.env.RAZORPAY_WEBHOOK_SECRET = "test_secret";
  const body = Buffer.from(JSON.stringify({ event: "payment_link.paid" }));
  const goodSig = createHmac("sha256", "test_secret").update(body).digest("hex");
  const forgedSig = createHmac("sha256", "wrong_secret").update(body).digest("hex");
  assert.equal(razorpay.verifyWebhookSignature(body, forgedSig), false, "forged secret accepted");
  assert.equal(razorpay.verifyWebhookSignature(Buffer.from("tampered body"), goodSig), false, "tampered body accepted");
  assert.equal(razorpay.verifyWebhookSignature(body, undefined), false, "missing signature accepted");
  restore();
});

await test("verification fails closed when no webhook secret is configured", () => {
  const restore = withoutEnv("RAZORPAY_WEBHOOK_SECRET");
  const body = Buffer.from(JSON.stringify({ event: "payment_link.paid" }));
  assert.equal(razorpay.verifyWebhookSignature(body, "anything"), false);
  restore();
});

/* ---------------- handlers: unconfigured deployments fail clearly ---------------- */

await test("create-order returns 501 when the database/Razorpay are unconfigured", async () => {
  const restore = withoutEnv("DATABASE_URL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET");
  const { default: handler } = await import(`../api/create-order.js?unconf=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "POST", body: valid, headers: {} }, res);
  assert.equal(res.statusCode, 501);
  assert.equal(res.payload.code, "not-configured");
  restore();
});

await test("create-order refuses the wrong HTTP verb regardless of config", async () => {
  const { default: handler } = await import(`../api/create-order.js?verb=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "GET", body: {}, headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "POST");
});

await test("order-lookup returns 501 when the database is unconfigured", async () => {
  const restore = withoutEnv("DATABASE_URL");
  const { default: handler } = await import(`../api/order-lookup.js?unconf=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "GET", url: "/api/order-lookup?ref=DV-AAAAAA", headers: {} }, res);
  assert.equal(res.statusCode, 501);
  restore();
});

await test("order-lookup rejects a missing ref", async () => {
  process.env.DATABASE_URL = "postgres://stub/db"; // just needs to be present — isConfigured() checks presence only
  const { default: handler } = await import(`../api/order-lookup.js?noref=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "GET", url: "/api/order-lookup", headers: {} }, res);
  assert.equal(res.statusCode, 400);
});

await test("order book (GET /api/orders) rejects a missing token before touching the database", async () => {
  const restore = withoutEnv("DATABASE_URL");
  const { default: handler } = await import(`../api/orders.js?noauth=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 401);
  restore();
});

await test("order book rejects a wrong token", async () => {
  const { default: handler } = await import(`../api/orders.js?badauth=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "GET", headers: { authorization: "Bearer wrong" } }, res);
  assert.equal(res.statusCode, 401);
});

await test("order-status rejects an invalid target status", async () => {
  process.env.ADMIN_TOKEN = "correct-horse-battery-staple";
  process.env.DATABASE_URL = "postgres://stub/db";
  const { default: handler } = await import(`../api/order-status.js?bad=${Date.now()}`);
  const res = mockRes();
  await handler(
    { method: "POST", body: { ref: "DV-AAAAAA", status: "posted" },
      headers: { authorization: "Bearer correct-horse-battery-staple" } },
    res
  );
  assert.equal(res.statusCode, 400);
});

/* ---------------- webhook: signature is checked before anything else ---------------- */

await test("webhook rejects a missing signature, even with no database configured", async () => {
  const restoreDb = withoutEnv("DATABASE_URL");
  process.env.RAZORPAY_WEBHOOK_SECRET = "test_secret";
  const { default: handler } = await import(`../api/razorpay-webhook.js?nosig=${Date.now()}`);
  const res = mockRes();
  const body = Buffer.from(JSON.stringify({ event: "payment_link.paid" }));
  await handler(mockRawReq(body, {}), res);
  assert.equal(res.statusCode, 400);
  restoreDb();
});

await test("webhook rejects a forged signature, even with no database configured", async () => {
  const restoreDb = withoutEnv("DATABASE_URL");
  process.env.RAZORPAY_WEBHOOK_SECRET = "test_secret";
  const { default: handler } = await import(`../api/razorpay-webhook.js?forged=${Date.now()}`);
  const res = mockRes();
  const body = Buffer.from(JSON.stringify({ event: "payment_link.paid" }));
  const badSig = createHmac("sha256", "wrong_secret").update(body).digest("hex");
  await handler(mockRawReq(body, { "x-razorpay-signature": badSig }), res);
  assert.equal(res.statusCode, 400);
  restoreDb();
});

await test("webhook 200s (rather than make Razorpay retry forever) when its own secret isn't set", async () => {
  const restore = withoutEnv("RAZORPAY_WEBHOOK_SECRET");
  const { default: handler } = await import(`../api/razorpay-webhook.js?nosecret=${Date.now()}`);
  const res = mockRes();
  const body = Buffer.from(JSON.stringify({ event: "payment_link.paid" }));
  await handler(mockRawReq(body, {}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ignored, "webhook not configured");
  restore();
});

await test("webhook refuses the wrong HTTP verb", async () => {
  const { default: handler } = await import(`../api/razorpay-webhook.js?verb=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

/* ---------------- mail.js: content, stubbed at fetch like Resend itself ---------------- */

const mail = await import("../api/_lib/mail.js");
process.env.RESEND_API_KEY = "stub-key";
process.env.SELLER_EMAIL = "seller@example.com";

await test("delivered email links straight to the file when fileUrl is present", async () => {
  const { sent } = stubMailFetch();
  const order = { ref: "DV-TEST01", email: "student@example.com", total: 199, items: [] };
  await mail.deliveredToBuyer(order, [{ title: "Gastroenterology — AMC 1", price: 199, fileUrl: "https://example.public.blob.vercel-storage.com/gastro-abc123.pdf" }]);
  assert.equal(sent.length, 1);
  const text = sent[0].text;
  assert.match(text, /ready to download/);
  assert.match(text, /https:\/\/example\.public\.blob\.vercel-storage\.com\/gastro-abc123\.pdf/);
  assert.doesNotMatch(text, /Sending separately/);
});

await test("delivered email falls back gracefully with no fileUrl yet", async () => {
  const { sent } = stubMailFetch();
  const order = { ref: "DV-TEST02", email: "student@example.com", total: 399, items: [] };
  await mail.deliveredToBuyer(order, [{ title: "General & Systemic Anatomy", price: 399 }]);
  assert.equal(sent.length, 1);
  const text = sent[0].text;
  assert.match(text, /Sending separately/);
  assert.doesNotMatch(text, /ready to download/);
});

await test("a mixed order lists linked and not-yet-linked titles separately", async () => {
  const { sent } = stubMailFetch();
  const order = { ref: "DV-TEST03", email: "student@example.com", total: 2, items: [] };
  await mail.deliveredToBuyer(order, [
    { title: "Has A Link", price: 1, fileUrl: "https://example.public.blob.vercel-storage.com/x.pdf" },
    { title: "No Link Yet", price: 1 },
  ]);
  const text = sent[0].text;
  assert.match(text, /ready to download[\s\S]*Has A Link/);
  assert.match(text, /Sending separately[\s\S]*No Link Yet/);
});

await test("seller alert reports the Razorpay payment id, or (pending) if absent", async () => {
  const base = { ref: "DV-TEST04", email: "student@example.com", total: 199, items: [{ title: "X", price: 199 }], placed_at: new Date().toISOString() };

  const { sent } = stubMailFetch();
  await mail.alertSeller({ ...base, razorpay_payment_id: "pay_abc123" });
  assert.match(sent[0].text, /pay_abc123/);

  const { sent: sent2 } = stubMailFetch();
  await mail.alertSeller({ ...base, ref: "DV-TEST05", razorpay_payment_id: null });
  assert.match(sent2[0].text, /\(pending\)/);
});

await test("mail degrades to sent:false, never throws, with no API key", async () => {
  const restore = withoutEnv("RESEND_API_KEY");
  const result = await mail.deliveredToBuyer({ ref: "DV-TEST06", email: "x@example.com", total: 0, items: [] }, []);
  assert.equal(result.sent, false);
  restore();
});

/* ---------------- health: honest, never leaks a secret ---------------- */

await test("health reports everything unconfigured, honestly", async () => {
  const restore = withoutEnv(
    "DATABASE_URL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "RESEND_API_KEY", "SELLER_EMAIL", "ADMIN_TOKEN", "BLOB_READ_WRITE_TOKEN"
  );
  const { default: handler } = await import(`../api/health.js?bare=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "GET", headers: {} }, res);
  restore();

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.db.configured, false);
  assert.equal(res.payload.payment.configured, false);
  assert.equal(res.payload.mail.configured, false);
  assert.equal(res.payload.admin.configured, false);
  assert.equal(res.payload.checkoutReady, false);
  assert.equal(res.payload.db.roundTrip, undefined, "must not probe when unconfigured");
});

await test("health never echoes a secret value", async () => {
  process.env.DATABASE_URL = "postgres://user:hunter2@ep-test.neon.tech/db";
  process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
  process.env.RAZORPAY_KEY_SECRET = "rzp_secret_xyz";
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_123";
  process.env.ADMIN_TOKEN = "correct-horse-battery-staple";
  const { default: handler } = await import(`../api/health.js?leak=${Date.now()}`);
  const res = mockRes();
  await handler({ method: "GET", headers: { authorization: "Bearer correct-horse-battery-staple" } }, res);
  const body = JSON.stringify(res.payload);
  for (const secret of ["hunter2", "rzp_secret_xyz", "whsec_123", "correct-horse-battery-staple"]) {
    assert.ok(!body.includes(secret), `health leaked ${secret}`);
  }
});

/* ---------------- catalogue ---------------- */

await test("catalogue carries both AMC 1 subject notebooks at Rs199", () => {
  for (const id of ["abroad-amc1-mental-health", "abroad-amc1-gastroenterology"]) {
    const p = PRODUCTS.find((x) => x.id === id);
    assert.ok(p, `${id} missing from the catalogue`);
    assert.equal(p.price, 199);
    assert.equal(p.cat, "abroad");
    assert.equal(p.sub, "amc-1");
  }
});

await test("AMC 1 holds several subject notebooks, not one lump", () => {
  assert.ok(PRODUCTS.filter((p) => p.sub === "amc-1").length >= 3, "expected Mental Health, Gastroenterology and the bundle placeholder");
});

/* ---------------------------------------------------------------- */

const failed = results.filter(([ok]) => !ok);
for (const [ok, name] of results) console.log(`  ${ok ? "✓" : "✗"} ${name}`);
console.log("=".repeat(56));
if (failed.length) {
  console.log(`${failed.length} of ${results.length} FAILED`);
  process.exit(1);
}
console.log(`all ${results.length} API checks passed`);
process.exit(0);
