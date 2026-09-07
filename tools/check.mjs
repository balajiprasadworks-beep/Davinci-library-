/**
 * End-to-end regression suite. Drives a real browser over the whole site:
 * the 3D figure, both filter levels, the cart, QR checkout, the dashboard,
 * profile persistence, the legal and 404 pages, and the iPad layout.
 *
 *   npm i -D playwright
 *   python3 -m http.server 8099     # from the repo root
 *   node tools/check.mjs
 *
 * Exits non-zero and lists every failure, so it works in CI as-is.
 * Set BASE_URL to test a deployed build instead of localhost.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:8099";
const OUT = process.env.SHOT_DIR ?? "/tmp";
const problems = [];
const log = (...a) => console.log(...a);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();

// Nothing static is allowed to 404 — the site is fully self-hosted and the
// payment QR is committed. The one exception is /api/*: those routes only
// exist on Vercel, so against a plain static server their absence is the
// very thing the checkout fallback is designed to survive.
const EXPECTED_MISSING = /\/api\//;

// A 404 surfaces as a console error whose text does NOT include the URL, so
// filtering console text cannot tell an expected miss from a real one. Watch
// responses instead, and drop the generic console duplicate.
page.on("response", (r) => {
  if (r.status() < 400 || EXPECTED_MISSING.test(r.url())) return;
  problems.push(`HTTP ${r.status()} for ${r.url()}`);
});
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (m.text().startsWith("Failed to load resource")) return;  // covered above
  problems.push(`console.error [${page.url()}]: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror [${page.url()}]: ${e.message}`));
const external = new Set();
page.on("request", (r) => {
  const u = r.url();
  if (!u.startsWith(BASE) && !u.startsWith("data:") && !u.startsWith("blob:")) external.add(new URL(u).host);
});
page.on("requestfailed", (r) => {
  const u = r.url();
  // The QR placeholder is expected to 404 until the seller adds their image.
  if (EXPECTED_MISSING.test(u)) return;
  problems.push(`requestfailed: ${u} — ${r.failure()?.errorText}`);
});

/* ---------- 1. homepage ---------- */
await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const header = await page.locator(".site-header").count();
log("header rendered:", header === 1);
if (header !== 1) problems.push("header did not mount");

const canvasOk = await page.evaluate(() => {
  const c = document.getElementById("anatomy");
  if (!c) return "missing canvas";
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  return { w: c.width, h: c.height, gl: !!gl };
});
const three3d = await page.evaluate(() => {
  const c = document.getElementById("anatomy");
  return c ? c.width > 300 : false;   // resize() ran => Three.js booted
});
log("canvas:", JSON.stringify(canvasOk), "| three.js booted:", three3d,
    "");

const cards = await page.locator("#pinned-grid .note-card").count();
log("homepage note cards:", cards);
if (cards < 30) problems.push(`expected full catalogue on homepage, saw ${cards}`);

// "Everything" must be newest-first, not catalogue order — the whole point
// is that a freshly added title surfaces at the top without re-sorting.
const firstCardTitle = (await page.locator("#pinned-grid .note-card h3").first().textContent()).trim();
log("first card in Everything view:", firstCardTitle);
if (!/Mental Health/.test(firstCardTitle)) {
  problems.push(`Everything should lead with the newest title, but the first card was "${firstCardTitle}"`);
}

const portals = await page.locator("#portals .portal").count();
log("category portals:", portals);
if (portals !== 3) problems.push(`expected 3 portals, saw ${portals}`);

/* ---------- 2. region filter ---------- */
await page.locator('[data-region="head"]').click();
await page.waitForTimeout(400);
const headCards = await page.locator("#pinned-grid .note-card").count();
const headTitle = await page.locator("#pinned-title").textContent();
log("head region:", headCards, "cards ·", headTitle);
if (headCards === 0 || headCards >= cards) problems.push("region filter did not narrow the grid");

/* ---------- 3. add to cart ---------- */
await page.locator('[data-region="all"]').click();
await page.waitForTimeout(300);
await page.locator("#pinned-grid [data-add]").first().click();
await page.locator("#pinned-grid [data-add]").nth(3).click();
await page.waitForTimeout(300);
const badge = await page.locator("[data-cart-count]").first().textContent();
log("cart badge after 2 adds:", badge);
if (badge.trim() !== "2") problems.push(`cart badge should read 2, read "${badge}"`);

await page.screenshot({ path: `${OUT}/home.png`, fullPage: false });

/* ---------- 4. hotspot click ---------- */
// Earlier steps scrolled the page. The site sets scroll-behavior:smooth,
// so a plain scrollTo is still animating when the bounding box is read —
// which made every synthetic click land above the canvas. Force an
// instant scroll and wait for it to actually land before measuring.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
await page.waitForTimeout(400);

const box = await page.locator("#anatomy").boundingBox();
if (box.y < 0) problems.push(`stage still off-screen at y=${box.y}`);

await page.mouse.click(box.x + box.width * 0.50, box.y + box.height * 0.26);
await page.waitForTimeout(400);
const pinOpened = await page.locator("#pin-card.is-visible").count() > 0;
const pinTitle = pinOpened ? await page.locator("#pin-title").textContent() : "";

log("anatomy hotspot opened a card:", pinOpened, pinTitle ? "· " + pinTitle : "");
if (pinOpened) await page.screenshot({ path: `${OUT}/pin.png` });
if (three3d && !pinOpened) problems.push("3D loaded but hotspots are not clickable");

/* ---------- 5. category pages ---------- */
for (const [file, minCards] of [["mbbs.html", 19], ["internship.html", 6], ["abroad.html", 9]]) {
  await page.goto(`${BASE}/${file}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const n = await page.locator("#grid .note-card").count();
  const tabs = await page.locator("#subnav button").count();
  log(`${file}: ${n} cards, ${tabs} tabs`);
  if (n < minCards) problems.push(`${file}: expected >= ${minCards} cards, saw ${n}`);
  if (tabs < 2) problems.push(`${file}: sub-category tabs missing`);
}

// Sub-tab filter on mbbs
await page.goto(`${BASE}/mbbs.html`, { waitUntil: "networkidle" });
await page.locator('[data-sub="year-1"]').click();
await page.waitForTimeout(300);
const y1 = await page.locator("#grid .note-card").count();
log("mbbs 1st year cards:", y1, "· url:", new URL(page.url()).search);
if (y1 !== 3) problems.push(`1st year should show 3 cards, saw ${y1}`);

/* ---------- 6. cart + checkout ---------- */
await page.goto(BASE + "/cart.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const lines = await page.locator(".cart-line").count();
const total = await page.locator(".summary-row.total .price").textContent();
log("cart lines:", lines, "· total:", total.trim());
if (lines !== 2) problems.push(`cart should hold 2 lines, saw ${lines}`);

// The QR is the entire payment path — assert it actually rendered.
const qr = await page.evaluate(() => {
  const img = document.querySelector(".qr-frame img");
  return {
    present: !!img,
    loaded: !!img && img.complete && img.naturalWidth > 0,
    placeholder: !!document.querySelector(".qr-frame .qr-missing"),
    upi: document.querySelector(".qr-upi")?.textContent.trim() ?? "",
  };
});
log("payment QR:", JSON.stringify(qr));
if (!qr.loaded) problems.push("payment QR image did not load on the cart page");
if (qr.placeholder) problems.push("cart is still showing the QR placeholder");
if (!qr.upi.includes("@")) problems.push("UPI ID not shown at checkout");

await page.screenshot({ path: `${OUT}/cart.png`, fullPage: true });

await page.fill("#email", "student@example.com");
await page.fill("#txn", "441122334455");
await page.click('#confirm-form button[type="submit"]');
await page.waitForTimeout(700);
const placed = await page.locator("text=Order placed").count();
const badgeAfter = await page.locator("[data-cart-count]").first().textContent();
const fallbackCopy = await page.locator("text=Send us the reference").count();
log("order placed:", placed > 0, "· badge cleared:", badgeAfter.trim() === "0",
    "· fallback copy shown:", fallbackCopy > 0);
if (!fallbackCopy) problems.push("no API here, so checkout should have shown the fallback instructions");
if (!placed) problems.push("checkout did not confirm the order");
if (badgeAfter.trim() !== "0") problems.push("cart was not emptied after checkout");

/* ---------- 7. dashboard reflects the order ---------- */
await page.goto(BASE + "/dashboard.html", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const statValues = await page.locator(".stat-value").allTextContents();
const orderRefs = await page.locator("#orders .cart-line h4").allTextContents();
log("dashboard stats:", statValues.join(" | "));
log("dashboard orders:", orderRefs.join(", "));
if (!orderRefs.length) problems.push("dashboard shows no order after checkout");
await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });

/* ---------- 8. profile persistence ---------- */
await page.goto(BASE + "/profile.html", { waitUntil: "networkidle" });
await page.fill("#name", "Balaji");
await page.selectOption("#exam", "NEET PG");
await page.click('#profile-form button[type="submit"]');
await page.waitForTimeout(400);
await page.goto(BASE + "/dashboard.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const greeting = await page.locator("#greeting").textContent();
log("greeting after profile save:", greeting.trim());
if (!greeting.includes("Balaji")) problems.push("profile did not persist to dashboard");

/* ---------- 9. mobile (iPad portrait) ---------- */
const ipad = await browser.newContext({ viewport: { width: 834, height: 1112 }, isMobile: false });
const m = await ipad.newPage();
m.on("pageerror", (e) => problems.push(`ipad pageerror: ${e.message}`));
await m.goto(BASE + "/index.html", { waitUntil: "networkidle" });
await m.waitForTimeout(2000);
const overflow = await m.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
log("iPad horizontal overflow (px):", overflow);
if (overflow > 2) problems.push(`page scrolls horizontally on iPad by ${overflow}px`);
await m.screenshot({ path: `${OUT}/ipad.png` });


/* ---------- 10. legal + 404 ---------- */
await page.goto(BASE + "/legal.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const legalSections = await page.locator(".prose h2[id]").allTextContents();
log("legal sections:", legalSections.join(" | "));
for (const id of ["terms", "refunds", "privacy", "disclaimer"]) {
  if (!(await page.locator(`#${id}`).count())) problems.push(`legal.html missing #${id}`);
}
const contactLink = await page.locator("[data-contact-email]").getAttribute("href");
log("legal contact link:", contactLink);
if (!contactLink?.startsWith("mailto:")) problems.push("legal contact link not wired to config");

await page.goto(BASE + "/404.html", { waitUntil: "networkidle" });
await page.waitForTimeout(300);
log("404 heading:", (await page.locator("h1").textContent()).trim());
if (!(await page.locator(".notfound .code").count())) problems.push("404 page did not render");

/* ---------- 11. skip link + footer legal links ---------- */
await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const skip = await page.locator(".skip-link").getAttribute("href");
log("skip link target:", skip);
if (skip !== "#main") problems.push("skip link missing or wrong target");
if (!(await page.locator("#main").count())) problems.push("no #main landmark to skip to");

const footerLinks = await page.locator(".footer-links a").allTextContents();
log("footer links:", footerLinks.join(", "));
for (const want of ["Terms", "Refunds", "Privacy"]) {
  if (!footerLinks.includes(want)) problems.push(`footer missing ${want} link`);
}

/* ---------- 12. checkout validation ---------- */
await page.locator("#pinned-grid [data-add]").first().click();
await page.goto(BASE + "/cart.html", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.click('#confirm-form button[type="submit"]');
await page.waitForTimeout(300);
const emailErr = await page.locator("#field-email.has-error").count();
log("empty submit shows inline error:", emailErr > 0);
if (!emailErr) problems.push("checkout submitted with no email and showed no error");
await page.fill("#email", "not-an-email");
await page.fill("#txn", "123456789");
await page.click('#confirm-form button[type="submit"]');
await page.waitForTimeout(300);
if (!(await page.locator("#field-email.has-error").count()))
  problems.push("invalid email accepted at checkout");
log("invalid email rejected: true");

/* ---------- 13. no third-party requests ---------- */
log("external hosts contacted:", external.size ? [...external].join(", ") : "none");
if (external.size) problems.push(`page made third-party requests: ${[...external].join(", ")}`);


/* ---------- 14. admin order book ---------- */
await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const signIn = await page.locator("#signin").count();
log("admin asks for a token:", signIn > 0);
if (!signIn) problems.push("admin page did not ask for a token");

await page.fill("#token", "any-token-will-do-here");
await page.click('#signin button[type="submit"]');
await page.waitForTimeout(600);
const setupShown = await page.locator("text=Backend not configured").count();
log("admin explains the missing backend:", setupShown > 0);
if (!setupShown) problems.push("admin page did not explain that the API is absent");

const indexed = await page.locator('meta[name="robots"]').getAttribute("content");
log("admin robots meta:", indexed);
if (!indexed?.includes("noindex")) problems.push("admin page is indexable");


/* ---------- 15. unfinished titles are visible but not purchasable ---------- */
await page.goto(BASE + "/abroad.html?sub=amc-1", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
const amcCards = await page.locator("#grid .note-card").count();
const amcSoon = await page.locator("#grid .note-card.is-soon").count();
const amcBuyable = await page.locator("#grid [data-add]").count();
const mentalHealth = await page.locator("#grid .note-card", { hasText: "Mental Health" }).count();
log(`AMC 1: ${amcCards} notebooks, ${amcSoon} in preparation, ${amcBuyable} addable · Mental Health listed: ${mentalHealth > 0}`);
if (!mentalHealth) problems.push("Mental Health notebook is not listed under AMC 1");
if (amcCards < 2) problems.push("AMC 1 should hold multiple subject notebooks");

// Mental Health is on sale; the bundle is listed but must not be buyable
// while it would contain a single notebook.
const mhAddable = await page.locator("#grid .note-card", { hasText: "Mental Health" })
  .locator("[data-add]").count();
if (!mhAddable) problems.push("Mental Health is on sale but has no Add to Cart");
if (amcSoon !== 1) problems.push(`expected only the bundle to be unlisted, saw ${amcSoon}`);

// Earlier steps in this suite add/remove items from the cart using
// position-based selectors (".first()", ".nth(3)"). Now that Mental Health
// sorts to the front of the homepage's "Everything" view, one of those
// earlier clicks can land on it and leave it sitting in the cart — so an
// "Add to Cart" click here would toggle it back OFF. Start from a clean
// cart so this assertion doesn't depend on what earlier steps happened to
// touch.
await page.evaluate(() => localStorage.removeItem("davinci.cart.v1"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);

await page.locator("#grid .note-card", { hasText: "Mental Health" }).locator("[data-add]").click();
await page.waitForTimeout(300);
await page.goto(BASE + "/cart.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const mhRow = page.locator(".cart-line", { hasText: "Mental Health" });
const mhLine = await mhRow.count();
// Assert the line price, not the total — earlier steps leave items in the cart.
const mhPrice = mhLine ? (await mhRow.locator(".price").textContent()).trim() : "";
log("Mental Health in cart:", mhLine > 0, "· line price:", mhPrice);
if (!mhLine) problems.push("Mental Health could not be added to the cart");
if (!mhPrice.includes("199")) problems.push(`Mental Health should price at Rs199, showed ${mhPrice}`);

await browser.close();

log("\n" + "=".repeat(56));
if (problems.length) {
  log("PROBLEMS:");
  problems.forEach((p) => log(" ✗ " + p));
  process.exit(1);
} else {
  log("ALL CHECKS PASSED");
}
