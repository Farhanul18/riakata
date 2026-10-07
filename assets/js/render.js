/* ==========================================================
   render.js — pembuat HTML kartu/daftar untuk halaman publik
   Semua teks dari database di-escape di sini. Jangan menyusun HTML artikel di tempat lain.
   ========================================================== */
import { escapeHtml, timeAgo, toDate, cloudinaryUrl, categoryName, href } from "./utils.js";
import { describeError } from "./articles.js";

export const articleUrl = (a) => href(`/artikel/${encodeURIComponent(a.slug)}`);
export const categoryUrl = (slug) => href(`/kategori/${encodeURIComponent(slug)}`);
export const tagUrl = (tag) => href(`/tag/${encodeURIComponent(tag)}`);

const crop = (w, h) => `f_auto,q_auto,c_fill,g_auto,w_${w},h_${h}`;

export function coverImg(a, w, h, attrs = 'loading="lazy"') {
  if (!a.coverUrl) return "";
  return `<img src="${escapeHtml(cloudinaryUrl(a.coverUrl, crop(w, h)))}" alt="${escapeHtml(a.coverAlt || "")}" width="${w}" height="${h}" ${attrs}>`;
}

export function badgeHtml(a, light = false) {
  const cls = light ? "badge--light" : `badge--${escapeHtml(a.category)}`;
  return `<a class="badge ${cls}" href="${categoryUrl(a.category)}">${escapeHtml(categoryName(a.category))}</a>`;
}

export function metaHtml(a, { date = true } = {}) {
  const d = toDate(a.publishedAt);
  return `<div class="meta">
    <span class="meta__item"><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>${a.readingTime || 1} menit baca</span>
    ${date && d ? `<span class="meta__item"><time datetime="${d.toISOString()}">${escapeHtml(timeAgo(d))}</time></span>` : ""}
  </div>`;
}

/** Kartu vertikal (grid Artikel Terbaru, halaman daftar). */
export function cardHtml(a) {
  return `<article class="card">
    <div class="card__media">${coverImg(a, 800, 500)}${badgeHtml(a, true)}</div>
    <div class="card__body">
      <h3 class="card__title"><a href="${articleUrl(a)}">${escapeHtml(a.title)}</a></h3>
      <p class="card__excerpt">${escapeHtml(a.excerpt || "")}</p>
      ${metaHtml(a).replace('class="meta"', 'class="meta card__meta"')}
    </div>
  </article>`;
}

/** Kartu horizontal di samping hero. */
export function sideCardHtml(a) {
  return `<article class="card card--side">
    <div class="card__media">${coverImg(a, 400, 500)}</div>
    <div class="card__body">
      ${badgeHtml(a)}
      <h2 class="card__title"><a href="${articleUrl(a)}">${escapeHtml(a.title)}</a></h2>
      <p class="card__excerpt">${escapeHtml(a.excerpt || "")}</p>
      ${metaHtml(a, { date: false })}
    </div>
  </article>`;
}

/** Isi elemen .hero (judulnya h1, jadi hanya dipakai di beranda). */
export function heroInnerHtml(a) {
  return `${coverImg(a, 1200, 720, 'fetchpriority="high"').replace("<img ", '<img class="hero__img" ')}
    <div class="hero__body">
      ${badgeHtml(a, true)}
      <h1 class="hero__title"><a href="${articleUrl(a)}">${escapeHtml(a.title)}</a></h1>
      <p class="hero__excerpt">${escapeHtml(a.excerpt || "")}</p>
      ${metaHtml(a)}
    </div>
    <p class="hero__note" aria-hidden="true">Budaya itu hidup, bukan cuma masa lalu</p>`;
}

/** Satu baris "Paling Banyak Dibaca". */
export function rankedItemHtml(a) {
  return `<li class="ranked__item">
    <div class="ranked__thumb">${coverImg(a, 160, 160)}</div>
    <div>
      <h3 class="ranked__title"><a href="${articleUrl(a)}">${escapeHtml(a.title)}</a></h3>
      <div class="meta"><span class="meta__item">${a.readingTime || 1} menit baca</span></div>
    </div>
  </li>`;
}

export const skeletonCards = (n = 4) => Array.from({ length: n }, () => `<div class="card" aria-hidden="true">
  <div class="skeleton" style="aspect-ratio:16/10;border-radius:0"></div>
  <div class="card__body"><div class="skeleton" style="height:1.1rem"></div><div class="skeleton" style="height:1.1rem;width:70%"></div><div class="skeleton" style="height:.8rem;margin-top:.5rem"></div></div>
</div>`).join("");

export const emptyHtml = (title, text = "") => `<div class="empty"><p class="empty__title">${escapeHtml(title)}</p>${text ? `<p>${escapeHtml(text)}</p>` : ""}</div>`;

export const errorHtml = (message) => `<div class="alert alert--error">${escapeHtml(message)} <button class="link-btn" type="button" data-retry>Coba lagi</button></div>`;

/**
 * Daftar artikel dengan tombol "Muat lebih banyak".
 * fetchPage(cursor) harus mengembalikan { items, cursor, hasMore } (lihat fetchPublished).
 * Mengembalikan fungsi start() untuk memulai dari awal.
 */
export function mountArticleList({ listEl, statusEl, moreBtn, fetchPage, emptyTitle, emptyText }) {
  let cursor = null;
  let loading = false;
  let firstLoad = true;

  async function loadMore() {
    if (loading) return;
    loading = true;
    moreBtn.disabled = true;
    moreBtn.textContent = "Memuat...";
    statusEl.innerHTML = "";
    try {
      const res = await fetchPage(cursor);
      if (firstLoad) listEl.innerHTML = "";
      if (firstLoad && !res.items.length) {
        statusEl.innerHTML = emptyHtml(emptyTitle, emptyText);
        moreBtn.hidden = true;
      } else {
        listEl.insertAdjacentHTML("beforeend", res.items.map(cardHtml).join(""));
        cursor = res.cursor;
        moreBtn.hidden = !res.hasMore;
        firstLoad = false;
      }
    } catch (err) {
      if (firstLoad) listEl.innerHTML = "";
      statusEl.innerHTML = errorHtml(describeError(err));
    } finally {
      loading = false;
      moreBtn.disabled = false;
      moreBtn.textContent = "Muat lebih banyak";
    }
  }

  moreBtn.addEventListener("click", loadMore);
  statusEl.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) { if (firstLoad) listEl.innerHTML = skeletonCards(8); loadMore(); } });
  return () => { listEl.innerHTML = skeletonCards(8); return loadMore(); };
}
