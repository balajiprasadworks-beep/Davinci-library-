# DaVinci's Medical Library

A 3D interactive storefront for medical notes — MBBS year-wise, internship
practical guides, and preparation for exams abroad.

Static pages with no build step and no framework, plus a small set of
serverless functions in `/api` that take payment, record orders and
deliver files automatically. Open it, edit it, push it.

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
| `cart.html` | Cart and Razorpay checkout |
| `order.html` | Post-payment status — polls for delivery, shows the download button |
| `dashboard.html` | Orders, stats, quick links |
| `profile.html` | Buyer details, stored locally |
| `legal.html` | Terms of sale, refunds, privacy, medical disclaimer |
| `404.html` | Branded not-found page (Vercel serves it automatically) |
| `admin.html` | Seller order book — `noindex`, unlinked, behind `ADMIN_TOKEN` |

Every page carries the same two-tier header: **Dashboard** and **Go to Cart** on
the top row, **View Cart** (with a live count) and **Profile** below it.

---

## The three things you will actually edit

### 1. Your payment, database and file storage accounts

There is no QR code any more — payment runs through **Razorpay**, orders are
recorded in **Neon**, and files are stored in **Cloudflare R2**. All three
need a one-time account setup before checkout works at all; see
**The backend** below for exactly what to create and which environment
variables to set. `js/config.js` itself only holds the buyer-facing checkout
copy now:

```js
export const PAYMENT = {
  currency: "INR",
  symbol: "₹",
  checkoutNote: "Shown under the Pay button on the cart page.",
};
```

### 2. Your contact routing — `js/config.js`

```js
export const SITE = {
  contactEmail: "you@example.com",
  whatsapp: "919876543210",   // optional; "" hides the WhatsApp button
};
```

### 3. Adding a note — `js/catalog.js`

Add one object — leave `status: "soon"` and `r2Key` off until the PDF is
actually uploaded (see **Automatic file delivery** below):

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
  file: "General & Systemic Anatomy.pdf",  // display filename only, not a path
  status: "soon",              // omit once a PDF is uploaded and it's on sale
  addedAt: "2026-09-08",       // today's date — see below
}
```

### New titles surface first automatically

The homepage's whole-library grid defaults to newest first, by `addedAt`. Use
today's date on every new entry and it appears at the top the moment you
push — no reordering the array, no separate "featured" flag to remember.

A sort dropdown next to the region tabs lets a visitor switch that: **Newly
added** (the default), **Default order** (catalogue order — untouched by
`addedAt`), **Price: Low to High**, **Price: High to Low**. A search box
beside it filters by title, description, category and sub-category as you
type. Both apply on top of whichever region tab is active.

### Not-yet-finished titles

`status: "soon"` lists a title so buyers can see it coming, but it cannot be
bought: the card renders dimmed with no Add to Cart, `cart.add()` refuses it,
and **the server refuses to price it** even if the request is hand-crafted.
Delete the line to put it on sale.

Selling something that does not exist yet is how refund disputes start, so the
gate is enforced in three places rather than one.

### Never commit a paid PDF

This repository is public and the site is served as static files. A PDF
committed to git is downloadable by anyone who guesses the URL — buying it
becomes optional. Keep the files out of git entirely; use `r2Key` and
**Automatic file delivery** below instead.

That's the whole workflow. The card, the filters, the cart and the anatomy
hotspot all pick it up automatically.

---

## The backend

`/api` holds the serverless functions that take payment, record orders and
deliver files — all of it required for checkout to work at all, unlike the
old manual flow this replaced. There is no local-only fallback: if the
backend isn't configured, the cart page says so plainly rather than faking a
sale (see **How the money flows** below).

| Route | Who | What |
| --- | --- | --- |
| `POST /api/create-order` | buyer | Prices the cart from the catalogue, records it, opens a Razorpay Payment Link |
| `POST /api/razorpay-webhook` | Razorpay | Confirms payment (signature-verified) and triggers delivery — the only place "paid" is decided |
| `GET /api/order-lookup?ref=` | buyer | Polled by `order.html` after a redirect back from Razorpay, to show the download button on the page |
| `GET /api/orders` | you | The order book behind `ADMIN_TOKEN` |
| `POST /api/order-status` | you | Manual override for support cases: refund / cancel / resend — not the routine path |
| `GET /api/health` | anyone | Which variables landed. Booleans only, never values. With an admin token it also round-trips the database. |

`/admin.html` is the seller UI over the two admin routes. It is `noindex` and
unlinked from the site.

### Why it's fully automatic

The old flow needed you to check your bank and click "mark delivered" for
every single sale — miss one and a paying buyer waits. This one has no such
step: Razorpay's webhook is the one place that decides a payment happened,
and it triggers delivery itself. `/admin.html` exists for visibility and the
rare refund or resend, not for routine order handling.

### The prices are server-side

`api/_lib/order.js` imports `js/catalog.js` — the same file the page renders
from — and sums the total itself. The browser sends product **ids only**.
`api/create-order.js` charges Razorpay exactly that amount; a tampered client
cannot invent a ₹1 order.

### Turning it on

Three services, each with a one-time setup, then a handful of environment
variables in Vercel (**Settings → Environment Variables**, then redeploy):

**1. Razorpay** — [dashboard.razorpay.com](https://dashboard.razorpay.com):
- Settings → API Keys → generate a key pair (start in **Test Mode**) →
  `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
- Settings → Webhooks → Add New Webhook → URL `https://yourdomain/api/razorpay-webhook`
  → set a secret (any string you choose) → `RAZORPAY_WEBHOOK_SECRET` (same
  value) → subscribe to `payment_link.paid` at minimum.

**2. Neon** — [neon.tech](https://neon.tech), create a project, then run
`db/schema.sql` once (Neon's SQL editor, or `psql "$DATABASE_URL" -f
db/schema.sql`) → copy the connection string as `DATABASE_URL`.

**3. Cloudflare R2** — Cloudflare dashboard → R2 → create a **private**
bucket → Manage API Tokens → create a token scoped to it → `R2_ACCOUNT_ID`
(R2 Overview page), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
See **Automatic file delivery** below for uploading the actual PDFs once this
is done.

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Neon. Without it, checkout (and `/api/orders`) return 501. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Creates the Payment Link at checkout. Without these, checkout returns 501. |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies the webhook is really from Razorpay. Without it, delivery never triggers even if payment succeeds. |
| `ADMIN_TOKEN` | Any long random string. Opens `/admin.html`. Unset means the admin API is off, not open. |
| `RESEND_API_KEY`, `SELLER_EMAIL`, `MAIL_FROM` | So orders email you and the buyer. Optional in the sense that a failed send never blocks a sale — but with no `RESEND_API_KEY`, a buyer gets no receipt at all beyond the download button shown on `order.html` itself. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Lets a confirmed payment auto-attach a download link. See **Automatic file delivery** below. |

One honest caveat on email: Resend only delivers to arbitrary addresses once
you verify a sending domain. Until then `MAIL_FROM` must be
`onboarding@resend.dev`, which can only reach your own address — fine for the
seller alert, not for buyer receipts.

### Did it work?

Open `/admin.html` and enter your `ADMIN_TOKEN`. If anything is missing it
prints a per-variable checklist and a live database round-trip, so you can see
which name is wrong instead of guessing from a failing checkout. Or hit
`/api/health` directly.

**Before switching Razorpay from Test Mode to live keys**, run one real
end-to-end order in test mode: add a title to the cart, pay with a
[Razorpay test card or test UPI VPA](https://razorpay.com/docs/payments/payments/test-card-upi-details/),
and confirm the webhook fires, the order reaches `delivered` in `/admin.html`,
and the email/download link actually arrives.

### Checks

```bash
node tools/check-api.mjs
```

36 tests, no server and no live credentials — Resend is stubbed via `fetch`,
and `order.build()`'s pricing/validation and the webhook's signature
verification are pure functions tested directly. Neon and R2 use their own
SDKs rather than raw `fetch`, so they are not stubbed; instead these checks
prove that an unconfigured deployment fails with a clear 501 rather than
crashing, and — the one that matters most — that the webhook verifies its
signature **before** touching the database at all, so a forged request never
reaches Neon or R2 no matter what is or isn't configured.

---

## How the money flows

Fully automatic, with no seller interaction:

1. Buyer adds notes to the cart, enters their email, clicks Pay.
2. `api/create-order.js` prices the cart from the catalogue and opens a
   **Razorpay Payment Link**; the buyer's browser is sent straight to it.
3. Buyer pays on Razorpay's own page — UPI, card, netbanking or wallet.
4. Razorpay redirects the buyer back to `order.html`, **and**, independently
   and more reliably, calls `api/razorpay-webhook.js` directly. The webhook
   is the only thing that decides a payment actually happened: its signature
   is verified against `RAZORPAY_WEBHOOK_SECRET`, and nothing the buyer's
   browser reports is ever trusted on its own.
5. Once verified, the order moves to `paid` in Neon, a fresh expiring
   download link is presigned from R2 for each title, and the buyer is
   emailed automatically.
6. `order.html` polls for that same result and shows the download button
   directly on the page — the buyer doesn't have to wait on email at all.

Nobody checks a bank account or clicks "mark delivered." `/admin.html` is
for visibility and the rare refund, cancellation or resend — see **Turning
it on** above for what needs to be configured before any of this can run.

### Automatic file delivery

Once a title has an `r2Key`, step 5 above finds the file with nothing more
from you — no attaching a PDF, no separate email.

**Why R2, not Google Drive or the git repo**: the backend has no Google
credentials, and wiring OAuth just to fetch one file is a project of its
own. It also isn't the git repo — see "Never commit a paid PDF" above; a
public repo has no private folder. [Cloudflare R2](https://developers.cloudflare.com/r2/)
is S3-compatible object storage with a generous free tier and no egress fees.

**Private bucket, not public.** A public bucket hands out a bare URL that
works forever for anyone who has it — fine for images, not for something
someone paid ₹199 for. This project uses a **private** bucket instead: a bare
object URL there needs a signature no buyer's browser can produce on its own,
so there is no permanent link to leak in the first place. Instead, the
backend generates a **presigned URL** — a link carrying its own signature
and up to a 7-day expiry (the hard ceiling for this kind of link, not a
choice this project made) — fresh, every time the buyer's payment is
confirmed or `order.html`/`order-lookup` is checked. A leaked link stops
working on its own, and a fresh one can always be reissued from the same
file without re-uploading anything.

**Per note:**

```bash
R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... \
  node tools/upload-note.mjs "notebook.pdf" abroad-amc1-mental-health
```

It prints an **object key** — not a working link by itself, since the bucket
is private. Paste it into that title's entry in `js/catalog.js`:

```js
r2Key: "notes/abc123-notebook.pdf",
```

Push. The next confirmed payment for that title signs a fresh link on the
spot — for every order of it, past or future, since it's resolved from the
catalogue at delivery time, not stored with the order.

**If R2 is slow or unreachable** when a link is being signed, that one
title's link is skipped rather than left hanging — the order still gets
marked delivered and the buyer still gets emailed, just with that title
listed as "sending separately." Nothing about a shaky network connection can
block a sale from closing out.

**Checking it's wired up**: `/admin.html` shows a "File delivery" status line
whenever the order book loads, and `/api/health` reports `fileDelivery` —
whether R2 is configured and how many titles have an `r2Key`, as booleans
and counts only, never the credentials or a URL.

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

## No third-party requests — while browsing

Three.js, GSAP and the three fonts all live in `vendor/` and are served from
this domain. Nothing — not a font, not a script, not an analytics beacon —
is fetched from anyone else while someone is just looking around the site.

This is deliberate on three counts: a student on hospital wifi with a blocked
CDN still gets a working site; there is no third party collecting IP addresses
from a visitor who never buys anything; and there is no outage but your own.
`tools/check.mjs` asserts it, failing the build if any external host creeps
into ordinary browsing.

Checkout is the one deliberate exception — paying necessarily sends the
buyer to Razorpay's own page, and the webhook/database/storage calls behind
delivery talk to Razorpay, Neon, Cloudflare R2 and Resend. `legal.html`
names all four and what each one actually receives.

## Checks

```bash
npm i -D playwright
python3 -m http.server 8099
node tools/check.mjs
```

Drives a real browser over the 3D figure, both filter levels, the cart,
checkout, the dashboard, profile persistence, the legal and 404 pages, the
iPad layout, and the no-third-party-while-browsing rule. Against a plain
static server (no Vercel functions), checkout has no backend to reach, so
what this actually proves about it is that it fails with a clear message and
leaves the cart untouched, rather than silently faking a sale. Exits
non-zero on failure, so it drops straight into CI. `BASE_URL=https://…
node tools/check.mjs` runs it against a deployed build. Pair it with `node
tools/check-api.mjs` (see **The backend** above) for the parts of checkout
that don't need a browser at all.

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

Cart and profile live in the buyer's `localStorage` and never leave their
browser. No analytics, no trackers, and no third-party requests while
browsing — see above. Checkout itself necessarily involves Razorpay, Neon,
Cloudflare R2 and Resend; `legal.html` is explicit about what each receives
and does not receive.
