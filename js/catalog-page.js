/* ============================================================
   CATALOG PAGE — renders the sub-category filter and the grid
   of note cards for one category. Used by mbbs / internship /
   abroad pages.
   ============================================================ */

import { CATEGORIES, byCategory, subLabel } from "./catalog.js";
import { money } from "./config.js";
import * as cart from "./cart.js";
import { mountShell, toast, revealAll, icons } from "./shell.js";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function cardHTML(p) {
  const inCart = cart.has(p.id);
  return `
  <article class="note-card reveal" data-id="${p.id}">
    <span class="note-tag">${esc(subLabel(p.cat, p.sub))}</span>
    <h3>${esc(p.title)}</h3>
    <p class="note-desc">${esc(p.desc)}</p>
    <div class="note-meta">${p.meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
    <div class="note-foot">
      <span class="price">${money(p.price)}${p.was ? `<span class="was">${money(p.was)}</span>` : ""}</span>
      <button class="btn btn-sm ${inCart ? "btn-ghost btn-add is-added" : "btn-primary btn-add"}"
              data-add="${p.id}" aria-label="${inCart ? "Remove" : "Add"} ${esc(p.title)} ${inCart ? "from" : "to"} cart">
        ${inCart ? icons.check + "In Cart" : "Add to Cart"}
      </button>
    </div>
  </article>`;
}

export function renderCategory(catId) {
  const cat = CATEGORIES[catId];
  if (!cat) throw new Error(`Unknown category: ${catId}`);

  mountShell(catId);

  const all = byCategory(catId);
  const subnav = document.getElementById("subnav");
  const grid = document.getElementById("grid");
  const countEl = document.getElementById("result-count");

  // Deep link: mbbs.html?sub=year-2
  const params = new URLSearchParams(location.search);
  let active = params.get("sub") && cat.subs.some((s) => s.id === params.get("sub"))
    ? params.get("sub")
    : "all";

  subnav.innerHTML = [{ id: "all", label: "All" }, ...cat.subs]
    .map(
      (s) =>
        `<button role="tab" data-sub="${s.id}" aria-selected="${s.id === active}">${esc(s.label)}</button>`
    )
    .join("");

  function paint() {
    const list = active === "all" ? all : all.filter((p) => p.sub === active);
    grid.innerHTML = list.length
      ? list.map(cardHTML).join("")
      : `<p class="empty-state">No notes in this section yet — they're on the way.</p>`;
    countEl.textContent = `${list.length} ${list.length === 1 ? "title" : "titles"}`;
    revealAll("#grid .reveal");
  }

  subnav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sub]");
    if (!btn) return;
    active = btn.dataset.sub;
    subnav.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.sub === active))
    );
    const url = new URL(location.href);
    active === "all" ? url.searchParams.delete("sub") : url.searchParams.set("sub", active);
    history.replaceState(null, "", url);
    paint();
  });

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const id = btn.dataset.add;
    const added = cart.toggle(id);
    toast(added ? "Added to cart" : "Removed from cart");
    // Repaint just this card's button.
    btn.className = `btn btn-sm ${added ? "btn-ghost btn-add is-added" : "btn-primary btn-add"}`;
    btn.innerHTML = added ? icons.check + "In Cart" : "Add to Cart";
  });

  paint();
}
