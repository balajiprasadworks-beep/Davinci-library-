# DaVinci's Medical Library

A 3D interactive storefront for medical notes — MBBS year-wise, internship
practical guides, and preparation for exams abroad.

Static site. No build step, no framework, no backend. Open it, edit it, push it.

---

## Run it locally

ES modules need to be served over HTTP — opening `index.html` from the file
system will not work.

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Pages

| File | What it is |
| --- | --- |
| `index.html` | 3D homepage — rotatable anatomy figure with region hotspots |
| `mbbs.html` | MBBS Level — 1st to 4th year |
| `internship.html` | Internship practical guides |
| `abroad.html` | NEET PG, USMLE, AMC, PLAB, DHA, MCAT |
| `cart.html` | Cart and QR checkout |
| `dashboard.html` | Orders, stats, quick links |
| `profile.html` | Buyer details, stored locally |
| `legal.html` | Terms of sale, refunds, privacy, medical disclaimer |
| `404.html` | Branded not-found page (Vercel serves it automatically) |

Every page carries the same two-tier header: **Dashboard** and **Go to Cart** on
the top row, **View Cart** (with a live count) and **Profile** below it.

---

## The three things you will actually edit

### 1. Your payment QR — `js/config.js` + `assets/img/`

Save your QR image as **`assets/img/payment-qr.png`**, then fill in:

```js
export const PAYMENT = {
  upiId: "yourname@okhdfcbank",
  accountName: "Your Name",
  ...
};
```

Until that image exists, checkout shows a clear placeholder instead of a broken
image — so the site is safe to publish before the QR is ready.

### 2. Your contact routing — `js/config.js`

```js
export const SITE = {
  contactEmail: "you@example.com",
  whatsapp: "919876543210",   // optional; "" hides the WhatsApp button
};
```

### 3. Adding a note — `js/catalog.js`

Drop the PDF into `notes/`, then add one object:

```js
{
  id: "mbbs-y1-anatomy",       // unique, never reuse — the cart keys off it
  cat: "mbbs",                 // mbbs | internship | abroad
  sub: "year-1",               // a sub-id from CATEGORIES
  title: "General & Systemic Anatomy",
  desc: "One or two lines of selling copy.",
  price: 399,
  was: 599,                    // optional strike-through
  meta: ["PDF", "Diagram-led"],
  region: "limbs",             // anatomy hotspot: head chest abdomen pelvis limbs systemic
  file: "notes/anatomy.pdf",
}
```

That's the whole workflow. The card, the filters, the cart and the anatomy
hotspot all pick it up automatically.

---

## How the money flows

There is no payment gateway. The flow is deliberately manual, which is what
works for a solo seller:

1. Buyer adds notes to the cart.
2. Checkout shows your QR and the exact total.
3. Buyer pays with any UPI app.
4. Buyer enters their email and the transaction ID.
5. The site records the order, gives them a reference (`DV…`), and opens a
   prefilled email or WhatsApp message addressed to you.
6. You verify the payment and send the PDFs.

Orders are stored in the buyer's own browser so they can see their history on
the dashboard. **You** are the system of record — check your bank, then deliver.

### If you later want automatic delivery

Add a payment gateway (Razorpay or Stripe) and a small serverless function that
verifies the webhook and emails a signed download link. Nothing in this codebase
blocks that; `cart.placeOrder()` is the single point you would swap.

---

## The 3D figure

The homepage figure is a real sculpted human mesh — `assets/model/male.glb`,
80k triangles, 1.4 MB — lit with a warm key, cool fill and a soft rim.

Six hotspots are pinned to anatomical regions. Tapping one opens a glass card,
glows that region through the body, and filters the grid below to the notes
anchored there.

### Replacing the model

Point `ANATOMY.modelUrl` in `js/config.js` at any standing human `.glb`/`.gltf`:

```js
export const ANATOMY = { modelUrl: "assets/model/male.glb" };
```

It is auto-scaled to a fixed height and stood on a fixed floor, so the hotspots
keep lining up without retuning. Set it to `""` to fall back to the built-in
procedural figure.

Two deliberate safety nets, both worth keeping:

- If the model 404s or fails to parse, the procedural figure stays on screen —
  the page can never end up empty.
- If the mesh carries no vertex normals, they are computed on load. Sculpt
  exports frequently omit them, and without this the body renders matte black.

### Preparing a new model

A raw sculpt is far too heavy to ship (the source here was 46 MB, 1.4M
triangles). `tools/obj-to-glb.py` decimates, orients and normalises it:

```bash
pip install trimesh fast-simplification numpy scipy
python3 tools/obj-to-glb.py
```

## No third-party requests

Three.js, GSAP and the three fonts all live in `vendor/` and are served from
this domain. Nothing — not a font, not a script, not an analytics beacon —
is fetched from anyone else.

This is deliberate on three counts: a student on hospital wifi with a blocked
CDN still gets a working site; there is no third party collecting IP addresses
from your buyers, which is what the privacy section promises; and there is no
outage but your own. `tools/check.mjs` asserts it, failing the build if any
external host creeps back in.

## Checks

```bash
npm i -D playwright
python3 -m http.server 8099
node tools/check.mjs
```

Drives a real browser over the 3D figure, both filter levels, the cart, QR
checkout, the dashboard, profile persistence, the legal and 404 pages, the
iPad layout, and the no-third-party rule. Exits non-zero on failure, so it
drops straight into CI. `BASE_URL=https://… node tools/check.mjs` runs it
against a deployed build.

## The share image

`assets/img/og.png` is what appears when someone drops a link into WhatsApp or
Twitter. Regenerate it after changing the headline or the model:

```bash
node tools/make-og.mjs
```

It renders the real figure, cropped at the hip — a full-frontal figure is fine
on the page in context, but it becomes a thumbnail in group chats, where it
reads very differently.

**One thing to change when you get a custom domain:** the `og:image` tags use a
relative path. Most crawlers resolve that, but Twitter prefers an absolute URL —
swap them to `https://yourdomain/assets/img/og.png` once the domain is live.

---

## Publishing

The site is static with no build step, so any static host works.

### Vercel (recommended — auto-deploys on push)

In the Vercel dashboard: **project → Settings → Git → Connect Git Repository →**
`balajiprasadworks-beep/Davinci-library-`. Set the production branch to the
branch you are pushing. Leave the framework preset as **Other** and the build
command empty — there is nothing to build.

`vercel.json` sets the caching and security headers:

- `/vendor/*` is cached for 30 days. Those filenames carry pinned versions.
- `/assets/model/*` is cached for a week and revalidated, since the model can
  be replaced.
- HTML is never cached, so a new note appears the moment you push.

`404.html` is picked up automatically for unknown routes.

### GitHub Pages

**Settings → Pages → Source: Deploy from a branch → your branch / root.**
Lands at `https://balajiprasadworks-beep.github.io/davinci-library-/`.
Note that Pages ignores `vercel.json`, so you lose the cache headers.

---

## Before you trade at scale

`legal.html` is a plain-English draft covering terms of sale, refunds, privacy
and a medical disclaimer. It is written to be honest about how this specific
site actually works, but it is **not legal advice**. Three things still need
your input:

- Your registered business name and address.
- Governing law and jurisdiction.
- A review by someone qualified, particularly on the refund terms and the
  medical disclaimer — you are selling clinical study material.

## Notes on privacy

Cart, orders and profile live in the buyer's `localStorage` and never leave
their browser until they choose to send the order email. No analytics, no
trackers, and no third-party requests of any kind — see above.
