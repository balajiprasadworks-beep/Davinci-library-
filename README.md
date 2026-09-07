# DaVinci's Medical Library

A 3D interactive storefront for medical notes — MBBS year-wise, internship
practical guides, and preparation for exams abroad.

Static pages with no build step and no framework, plus three optional
serverless functions that record orders. Open it, edit it, push it.

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
| `admin.html` | Seller order book — `noindex`, unlinked, behind `ADMIN_TOKEN` |

Every page carries the same two-tier header: **Dashboard** and **Go to Cart** on
the top row, **View Cart** (with a live count) and **Profile** below it.

---

## The three things you will actually edit

### 1. Your payment QR — `js/config.js` + `assets/img/`

**Already configured** — `balajiprasadworks-1@oksbi`, Balaji Prasad. Change it
only if you move to a different UPI account.

To swap in a new one, hand the tool a screenshot from GPay/PhonePe:

```bash
pip install pillow numpy opencv-python-headless
python3 tools/prep-qr.py ~/Downloads/new-qr.png
```

It crops to the symbol, rebuilds the quiet zone on white, and **refuses to
write the file if the crop changes what the code decodes to** — a QR that no
longer scans looks perfectly fine to the eye. Then update `js/config.js`:

```js
export const PAYMENT = {
  upiId: "yourname@okhdfcbank",
  accountName: "Your Name",
  ...
};
```

If the image is ever missing, checkout shows a labelled placeholder rather than
a broken image, and `tools/check.mjs` fails.

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
  status: "soon",              // omit once it is finished and on sale
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
committed under `notes/` is downloadable by anyone who guesses the URL —
buying it becomes optional. Keep the files out of git; use `blobPath` and
**Automatic file delivery** below instead, or send them by hand.

That's the whole workflow. The card, the filters, the cart and the anatomy
hotspot all pick it up automatically.

---

## The backend

The site is static, but `/api` holds three Vercel serverless functions that
record orders. **All of it is optional** — with no environment variables set,
checkout falls back to the original browser-only flow and nothing breaks. The
test suite covers both paths.

| Route | Who | What |
| --- | --- | --- |
| `POST /api/order` | buyer | Prices the order from the catalogue, stores it, emails you and the buyer |
| `GET /api/orders` | you | The order book behind `ADMIN_TOKEN` |
| `POST /api/order-status` | you | Mark delivered / refunded / cancelled |
| `GET /api/health` | anyone | Which variables landed. Booleans only, never values. With an admin token it also round-trips the database. |

`/admin.html` is the seller UI over those two admin routes. It is `noindex`
and unlinked from the site.

### Why it exists

Without it you only learn about a sale if the buyer remembers to email you the
reference. When they forget, money arrives in your account with no way to tell
who paid or what to send. The API records the order the moment they check out.

### The prices are server-side

`api/_lib/order.js` imports `js/catalog.js` — the same file the page renders
from — and sums the total itself. The browser sends product **ids only**. A
tampered client cannot invent a ₹1 order.

### Turning it on

In Vercel, **Settings → Environment Variables**, then redeploy:

| Variable | Why |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Free Upstash Redis. Without these `/api/order` returns 501 and checkout falls back. |
| `ADMIN_TOKEN` | Any long random string. Opens `/admin.html`. Unset means the admin API is off, not open. |
| `RESEND_API_KEY`, `SELLER_EMAIL`, `MAIL_FROM` | So a new order emails you. Optional — a failed email never fails an order. |
| `BLOB_READ_WRITE_TOKEN` | Lets "Mark delivered" auto-attach a download link. See **Automatic file delivery** below — Vercel sets this for you when you connect a **private** Blob store, nothing to type in. |

One honest caveat on email: Resend only delivers to arbitrary addresses once
you verify a sending domain. Until then `MAIL_FROM` must be
`onboarding@resend.dev`, which can only reach your own address — fine for the
seller alert, not for buyer receipts.

### Did it work?

Open `/admin.html` and enter your `ADMIN_TOKEN`. If anything is missing it
prints a per-variable checklist and a live database round-trip, so you can see
which name is wrong instead of guessing from a failing checkout. Or hit
`/api/health` directly.

### Checks

```bash
node tools/check-api.mjs
```

36 tests, no server and (for these paths) no real network — Redis and Resend
are stubbed via `fetch`. Covers server-side pricing, that a client-supplied
total is ignored, validation, admin auth, that marking an order delivered
emails the buyer exactly once, and that the delivery email correctly links a
title's file (or falls back gracefully when nothing presigns — a missing
`blobPath`, or a slow/failing call to Vercel's Blob API, both leave the
"delivered" transition and the email itself unharmed).

---

## How the money flows

There is still no payment gateway. The flow is deliberately manual, which is
what works for a solo seller:

1. Buyer adds notes to the cart.
2. Checkout shows your QR and the exact total.
3. Buyer pays with any UPI app.
4. Buyer enters their email and the transaction ID.
5. The site records the order, gives them a reference (`DV…`), and opens a
   prefilled email or WhatsApp message addressed to you.
6. **You** check your bank — there is no payment gateway, so this step is
   never automatic — then mark the order delivered on `/admin.html`.
7. That marks the buyer's file(s) as sent. If the title has a `blobPath`
   (see below), the email to the buyer includes a fresh, expiring download
   link automatically. If not, it says the file is coming separately, and
   you send it yourself the way you always have.

With the backend on, step 5 happens automatically and the buyer has nothing to
send you. Without it, they have to email the reference themselves.

Orders are stored in the buyer's own browser so they can see their history on
the dashboard. **You** are the system of record — check your bank, then deliver.

### Automatic file delivery

Once a title has a `blobPath`, step 7 needs nothing from you beyond clicking
"Mark delivered" — no attaching a PDF, no separate email.

**Why this isn't Google Drive**: the backend has no Google credentials, and
wiring OAuth just to fetch one file is a real project of its own. It also
isn't the git repo — see "Never commit a paid PDF" above; a public repo has
no private folder. It's [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
instead — one token, already scoped to this project, no OAuth flow.

**Private store, not public.** A public Blob store hands out a bare URL that
works forever for anyone who has it — fine for images, not for something
someone paid ₹199 for. This project uses a **private** store instead: a bare
blob URL there needs an `Authorization` header a buyer's browser can't send,
so there is no permanent link to leak in the first place. Instead, the
backend generates a **presigned URL** — a link carrying its own signature
and a 7-day expiry — fresh, at the moment an order is marked delivered. A
leaked link stops working on its own, and a fresh one can always be
reissued from the same file without re-uploading anything.

**One-time setup:**

1. Vercel dashboard → your project → **Storage → Create Database → Blob →
   Connect**, choosing a **Private** store. This adds `BLOB_READ_WRITE_TOKEN`
   to your environment variables itself — nothing to copy by hand into
   Vercel.
2. To run the upload script locally, copy that same token from **Storage →
   your Blob store → `.env.local` tab** into your shell.

**Per note, from then on:**

```bash
BLOB_READ_WRITE_TOKEN=... node tools/upload-note.mjs "notebook.pdf" abroad-amc1-mental-health
```

It prints a **pathname** — not a working link by itself, since the store is
private. Paste it into that title's entry in `js/catalog.js`:

```js
blobPath: "notebook-abc123.pdf",
```

Push. The next "Mark delivered" for that title signs a fresh link on the
spot — for every order of it, past or future, since it's resolved from the
catalogue at delivery time, not stored with the order.

**If Vercel's Blob API is slow or unreachable** when a link is being signed,
that one title's link is skipped rather than left hanging — the order still
gets marked delivered and the buyer still gets emailed, just with that title
listed as "sending separately." Nothing about a shaky network connection can
block a sale from closing out.

**Checking it's wired up**: `/admin.html` shows a "File delivery" status line
whenever the order book loads, and `/api/health` reports `fileDelivery` —
whether the token is set and how many titles have a `blobPath`, as booleans
and counts only, never the token or a URL.

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
