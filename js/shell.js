/* ============================================================
   SHELL — shared header, footer, cart badge, toasts, reveals.
   Every page calls mountShell() once.
   ============================================================ */

import { SITE } from "./config.js";
import { CATEGORIES } from "./catalog.js";
import * as cart from "./cart.js";

/* ---------- icons ---------- */

const I = {
  compass: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.1 5-5 2.1 2.1-5z"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.2l2.4 12.1a1.6 1.6 0 0 0 1.6 1.3h8.9a1.6 1.6 0 0 0 1.6-1.2L21 7H5.5"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 17.5h15"/></svg>`,
  stethoscope: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M6 3H4.5M14 3h1.5"/><path d="M10 13v2.5a4.5 4.5 0 0 0 9 0V14"/><circle cx="19" cy="12" r="2"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>`,
};

export { I as icons };

/* ---------- header ---------- */

function headerHTML(active) {
  const link = (href, icon, label, key, extra = "") => `
    <a class="icon-btn${active === key ? " is-active" : ""}" href="${href}"${extra}>
      ${icon}<span class="label-lg">${label}</span>
    </a>`;

  return `
  <header class="site-header">
    <div class="header-top">
      <a class="brand" href="index.html">
        <span class="brand-mark">${I.compass}</span>
        <span>
          DaVinci's Medical Library
          <span class="brand-sub">${SITE.tagline}</span>
        </span>
      </a>
      <nav class="header-nav" aria-label="Primary">
        ${link("dashboard.html", I.grid, "Dashboard", "dashboard")}
        ${link("cart.html", I.cart, "Go to Cart", "cart")}
      </nav>
    </div>
    <div class="header-sub">
      <a class="icon-btn compact" href="cart.html" aria-label="View cart">
        ${I.bag}<span>View Cart</span>
        <span class="cart-count" data-cart-count data-empty="true">0</span>
      </a>
      <a class="icon-btn compact${active === "profile" ? " is-active" : ""}" href="profile.html">
        ${I.user}<span>Profile</span>
      </a>
    </div>
  </header>`;
}

/* ---------- footer ---------- */

function footerHTML() {
  const cats = Object.values(CATEGORIES)
    .map((c) => `<a href="${c.page}">${c.title}</a>`)
    .join("");

  return `
  <footer class="site-footer">
    <div class="wrap footer-inner">
      <p>© ${new Date().getFullYear()} DaVinci's Medical Library · Notes for doctors and students in training.</p>
      <nav class="footer-links" aria-label="Footer">
        ${cats}
        <a href="dashboard.html">Dashboard</a>
        <a href="mailto:${SITE.contactEmail}">Contact</a>
      </nav>
    </div>
  </footer>`;
}

/* ---------- toast ---------- */

let toastEl, toastTimer;

export function toast(message) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = `${I.check}<span></span>`;
  toastEl.querySelector("span").textContent = message;

  requestAnimationFrame(() => toastEl.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2400);
}

/* ---------- scroll reveals ---------- */

export function revealAll(selector = ".reveal") {
  const nodes = [...document.querySelectorAll(selector)];
  if (!nodes.length) return;

  const gsap = window.gsap;
  if (!gsap) {
    document.documentElement.classList.add("no-gsap");
    return;
  }

  if (window.ScrollTrigger) {
    gsap.registerPlugin(window.ScrollTrigger);
    nodes.forEach((el) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.75,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });
  } else {
    gsap.to(nodes, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: "power3.out" });
  }
}

/* ---------- mount ---------- */

export function mountShell(active = "") {
  const head = document.getElementById("header-slot");
  const foot = document.getElementById("footer-slot");
  if (head) head.outerHTML = headerHTML(active);
  if (foot) foot.outerHTML = footerHTML();

  // Live cart badge on every page.
  cart.onChange((_, n) => {
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(n);
      el.dataset.empty = n === 0 ? "true" : "false";
    });
  });
}
