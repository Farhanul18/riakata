/* ==========================================================
   fb-index.js — beranda dengan data asli dari Firestore
   Hero = artikel isHeadline (cadangan: terbaru). Samping = Pilihan Editor.
   Grid = terbaru. Sidebar = paling banyak dibaca. Chip = settings/site.hotTopics.
   ========================================================== */
import { fetchPublished, fetchHeadline, fetchSettings, describeError } from "./articles.js";
import { heroInnerHtml, sideCardHtml, cardHtml, rankedItemHtml, emptyHtml, errorHtml, tagUrl } from "./render.js";
import { escapeHtml, slugify } from "./utils.js";

const $ = (id) => document.getElementById(id);
const heroEl = $("hero");
const gridEl = $("latest-grid");
const rankedEl = $("ranked-list");
const hotWrap = document.querySelector(".hot-topics");
const hotEl = $("hot-topics");

const value = (r) => (r.status === "fulfilled" ? r.value : null);
const done = (...els) => els.forEach((el) => el.removeAttribute("aria-busy"));

function renderHotTopics(settings) {
  const topics = (settings.hotTopics || []).map((t) => slugify(String(t))).filter(Boolean).slice(0, 8);
  if (!topics.length) return;
  hotEl.innerHTML = '<span class="chip-row__label">Topik Hangat</span>' +
    topics.map((t) => `<a class="chip" href="${tagUrl(t)}">#${escapeHtml(t)}</a>`).join("");
  hotWrap.hidden = false;
}

async function load() {
  const [headlineR, picksR, latestR, popularR, settingsR] = await Promise.allSettled([
    fetchHeadline(),
    fetchPublished({ pick: true, pageSize: 3 }),
    fetchPublished({ pageSize: 9 }),
    fetchPublished({ order: "views", pageSize: 5 }),
    fetchSettings(),
  ]);

  // Semua gagal = hampir pasti masalah koneksi/rules/index
  if ([headlineR, latestR, popularR].every((r) => r.status === "rejected")) {
    const message = describeError(latestR.reason);
    heroEl.outerHTML = `<div class="featured__error">${errorHtml(message)}</div>`;
    gridEl.innerHTML = "";
    rankedEl.innerHTML = "";
    document.querySelector(".featured__error")?.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) location.reload(); });
    return;
  }

  const latest = value(latestR)?.items || [];
  const used = new Set();

  // 1) Hero
  const hero = value(headlineR) || latest[0] || null;
  if (hero) {
    used.add(hero.id);
    heroEl.innerHTML = heroInnerHtml(hero);
    heroEl.style.gridColumn = "1 / -1";
    if (!hero.coverUrl) heroEl.style.background = "var(--color-green-dark)";
  } else {
    heroEl.outerHTML = `<div class="featured__error">${emptyHtml("Belum ada artikel terbit", "Artikel pertama akan muncul di sini setelah diterbitkan redaksi.")}</div>`;
  }
  done(heroEl);

  // 3) Grid Artikel Terbaru
  const grid = latest.filter((a) => !used.has(a.id)).slice(0, 6);
  gridEl.innerHTML = grid.length ? grid.map(cardHtml).join("") : emptyHtml("Belum ada artikel lainnya");
  gridEl.style.display = grid.length ? "" : "block";
  done(gridEl);

  // 4) Paling Banyak Dibaca
  const popular = value(popularR)?.items || [];
  rankedEl.innerHTML = popular.length ? popular.map(rankedItemHtml).join("") : '<li class="empty">Belum ada data bacaan.</li>';
  done(rankedEl);

  // 5) Topik Hangat
  renderHotTopics(value(settingsR) || {});
}

load();