/**
 * Render assets/img/og.png — the 1200x630 preview card that appears when
 * someone shares a link on WhatsApp, Twitter or Slack.
 *
 *   npm i -D playwright
 *   python3 -m http.server 8099        # from the repo root
 *   node tools/make-og.mjs
 *
 * It writes a temporary page at the repo root so relative asset paths
 * resolve, screenshots it, and removes it again. The browser context
 * emulates reduced motion, which switches the figure's auto-rotation off
 * so the pose is identical on every run.
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE_URL ?? "http://localhost:8099";
const TMP = path.join(ROOT, "._og.html");
const OUT = path.join(ROOT, "assets", "img", "og.png");

const page_html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="assets/css/style.css">
<script type="importmap">
{"imports":{"three":"./vendor/three/three.module.js","three/addons/":"./vendor/three/addons/"}}
</script>
<style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  .og {
    width: 1200px; height: 630px;
    display: grid; grid-template-columns: 1fr 470px;
    align-items: center; gap: 20px;
    padding: 0 0 0 76px;
    position: relative;
  }
  .og-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 34px; }
  .og-brand .brand-mark { width: 44px; height: 44px; }
  .og-brand .brand-mark svg { width: 26px; height: 26px; }
  .og-name {
    font-family: var(--font-display); font-size: 1.7rem; font-weight: 600;
    color: var(--text-100); letter-spacing: 0.01em;
  }
  .og h1 {
    font-size: 4.05rem; line-height: 1.04; margin: 0 0 26px;
    letter-spacing: -0.02em;
  }
  .og h1 .gold {
    background: linear-gradient(120deg, var(--gold-400), var(--gold-600));
    -webkit-background-clip: text; background-clip: text;
    color: transparent; font-style: italic;
  }
  .og-tags {
    font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--gold-500);
  }
  .og-stage { width: 470px; height: 630px; position: relative; overflow: hidden; }
  /* Show the figure from the crown to roughly the hip. The canvas is
     oversized in BOTH axes: the camera fits vertically, so growing only
     the height would push the arms outside the frame. */
  .og-stage canvas {
    width: 760px; height: 1480px; display: block;
    position: absolute; top: -96px; left: -145px;
  }
</style></head>
<body>
  <div class="og">
    <div>
      <div class="og-brand">
        <span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 5-5 2.1 2.1-5z"/></svg></span>
        <span class="og-name">DaVinci's Medical Library</span>
      </div>
      <h1>Deep enough to understand.<br><span class="gold">Fast enough to revise.</span></h1>
      <p class="og-tags">MBBS · Internship · NEET PG · USMLE · PLAB · AMC</p>
    </div>
    <div class="og-stage"><canvas id="anatomy"></canvas></div>
  </div>
  <script type="module">
    import { initAnatomy } from "./js/anatomy.js";
    import { ANATOMY } from "./js/config.js";
    initAnatomy(document.getElementById("anatomy"), { modelUrl: ANATOMY.modelUrl });
  </script>
</body></html>`;

fs.writeFileSync(TMP, page_html);

try {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",   // stops the figure auto-rotating
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));

  await page.goto(`${BASE}/._og.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);          // model download + first frames
  await page.screenshot({ path: OUT });
  await browser.close();

  console.log("wrote", OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + " KB");
} finally {
  fs.rmSync(TMP, { force: true });
}
