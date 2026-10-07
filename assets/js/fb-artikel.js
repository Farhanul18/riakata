/* ==========================================================
   fb-artikel.js — halaman baca artikel (?slug=... atau /artikel/judul)
   Memuat artikel terbit, mengisi SEO dasar, menghitung pembaca,
   dan menampilkan artikel terkait serta "Paling Banyak Dibaca".
   ========================================================== */
import { db, doc, updateDoc, increment } from "./firebase-config.js";
import { fetchBySlug, fetchPublished, describeError } from "./articles.js";
import { articleUrl, categoryUrl, tagUrl, cardHtml, rankedItemHtml, emptyHtml, errorHtml } from "./render.js";
import { routeParam, escapeHtml, formatDate, toDate, cloudinaryUrl, sanitizeHtml, categoryName, href } from "./utils.js";

const $ = (id) => document.getElementById(id);
const articleEl = $("article");
const rankedEl = $("ranked-list");

const slug = routeParam("slug", "/artikel");

/* ---------- SEO: judul, deskripsi, Open Graph, JSON-LD ---------- */
function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    const [, key, val] = selector.match(/\[(\w+(?::\w+)?)="([^"]+)"\]/);
    el.setAttribute(key, val);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function applySeo(a) {
  const url = `${location.origin}/artikel/${encodeURIComponent(a.slug)}`;
  const image = a.coverUrl ? cloudinaryUrl(a.coverUrl, "f_auto,q_auto,c_fill,g_auto,w_1200,h_630") : "";
  const description = a.excerpt || "Cerita, Budaya, Kita.";

  document.title = `${a.title} — Riakata`;
  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[property="og:type"]', "content", "article");
  setMeta('meta[property="og:title"]', "content", a.title);
  setMeta('meta[property="og:description"]', "content", description);
  setMeta('meta[property="og:url"]', "content", url);
  setMeta('meta[name="twitter:card"]', "content", image ? "summary_large_image" : "summary");
  if (image) setMeta('meta[property="og:image"]', "content", image);

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;

  const ld = document.createElement("script");
  ld.type = "application/ld+json";
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.title,
    description,
    image: image ? [image] : undefined,
    datePublished: toDate(a.publishedAt)?.toISOString(),
    dateModified: (toDate(a.updatedAt) || toDate(a.publishedAt))?.toISOString(),
    author: { "@type": "Person", name: a.authorName || "Redaksi Riakata" },
    publisher: { "@type": "Organization", name: "Riakata", logo: { "@type": "ImageObject", url: `${location.origin}/assets/logo/favicon.svg` } },
    mainEntityOfPage: url,
  });
  document.head.appendChild(ld);
}

/* ---------- Tampilan artikel ---------- */
function renderArticle(a) {
  const published = toDate(a.publishedAt);
  const cover = a.coverUrl
    ? `<figure class="article__cover"><img src="${escapeHtml(cloudinaryUrl(a.coverUrl, "f_auto,q_auto,c_fill,g_auto,w_1200,h_675"))}" alt="${escapeHtml(a.coverAlt || "")}" width="1200" height="675" fetchpriority="high">${a.coverCredit ? `<figcaption>${escapeHtml(a.coverCredit)}</figcaption>` : ""}</figure>`
    : "";
  const tags = (a.tags || []).map((t) => `<a class="chip" href="${tagUrl(t)}">#${escapeHtml(t)}</a>`).join("");

  articleEl.innerHTML = `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="${href("/")}">Beranda</a> <span aria-hidden="true">/</span>
      <a href="${categoryUrl(a.category)}">${escapeHtml(categoryName(a.category))}</a>
    </nav>
    <header>
      <a class="badge badge--${escapeHtml(a.category)}" href="${categoryUrl(a.category)}">${escapeHtml(categoryName(a.category))}</a>
      <h1 class="article__title">${escapeHtml(a.title)}</h1>
      ${a.excerpt ? `<p class="article__excerpt">${escapeHtml(a.excerpt)}</p>` : ""}
      <div class="article__byline">
        <span class="article__author">${escapeHtml(a.authorName || "Redaksi Riakata")}</span>
        ${published ? `<time datetime="${published.toISOString()}">${escapeHtml(formatDate(published))}</time>` : ""}
        <span>${a.readingTime || 1} menit baca</span>
        <span id="view-count">${(a.views || 0).toLocaleString("id-ID")} dibaca</span>
      </div>
    </header>
    ${cover}
    <div class="prose">${sanitizeHtml(a.content || "")}</div>
    ${tags ? `<div class="chip-row article__tags" style="flex-wrap:wrap" aria-label="Tag">${tags}</div>` : ""}
    <div class="share" id="share"><span class="share__label">Bagikan</span></div>
    <section class="related" id="related" hidden aria-labelledby="judul-terkait">
      <div class="section-head"><h2 class="section-title" id="judul-terkait">Baca juga</h2></div>
      <div class="related-grid" id="related-grid"></div>
    </section>`;
  articleEl.removeAttribute("aria-live");
}

/* ---------- Tombol bagikan ---------- */
function renderShare(a) {
  const url = `${location.origin}/artikel/${encodeURIComponent(a.slug)}`;
  const text = encodeURIComponent(a.title);
  const link = encodeURIComponent(url);
  const box = $("share");
  const items = [
    ["WhatsApp", `https://wa.me/?text=${text}%20${link}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${link}`],
    ["X", `https://twitter.com/intent/tweet?text=${text}&url=${link}`],
  ];
  box.insertAdjacentHTML("beforeend", items.map(([label, to]) => `<a class="btn btn--outline btn--sm" href="${to}" target="_blank" rel="noopener noreferrer">${label}</a>`).join("") +
    '<button class="btn btn--outline btn--sm" type="button" id="copy-link">Salin tautan</button>');

  $("copy-link").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = "Tersalin!";
    } catch {
      btn.textContent = "Gagal menyalin";
    }
    setTimeout(() => { btn.textContent = "Salin tautan"; }, 2000);
  });

  if (navigator.share) {
    box.insertAdjacentHTML("beforeend", '<button class="btn btn--primary btn--sm" type="button" id="native-share">Bagikan...</button>');
    $("native-share").addEventListener("click", () => navigator.share({ title: a.title, url }).catch(() => {}));
  }
}

/* ---------- Penghitung pembaca (sekali per sesi per artikel) ---------- */
async function countView(a) {
  const key = `riakata:viewed:${a.id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch { /* penyimpanan diblokir: tetap hitung */ }

  try {
    await updateDoc(doc(db, "articles", a.id), { views: increment(1) });
    $("view-count").textContent = `${((a.views || 0) + 1).toLocaleString("id-ID")} dibaca`;
  } catch (err) {
    console.warn("[views]", err.code || err); // gagal menghitung tidak boleh mengganggu pembaca
  }
}

/* ---------- Artikel terkait & terpopuler ---------- */
async function loadRelated(a) {
  try {
    const { items } = await fetchPublished({ category: a.category, pageSize: 4 });
    const related = items.filter((x) => x.id !== a.id).slice(0, 3);
    if (!related.length) return;
    $("related-grid").innerHTML = related.map(cardHtml).join("");
    $("related").hidden = false;
  } catch (err) {
    console.warn("[terkait]", err.code || err);
  }
}

async function loadPopular() {
  try {
    const { items } = await fetchPublished({ order: "views", pageSize: 5 });
    rankedEl.innerHTML = items.length ? items.map(rankedItemHtml).join("") : '<li class="empty">Belum ada data bacaan.</li>';
  } catch (err) {
    rankedEl.innerHTML = '<li class="empty">Tidak bisa dimuat.</li>';
  }
}

/* ---------- Mulai ---------- */
async function start() {
  loadPopular();
  if (!slug) return showNotFound();

  let article;
  try {
    article = await fetchBySlug(slug);
  } catch (err) {
    articleEl.innerHTML = errorHtml(describeError(err));
    articleEl.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) location.reload(); });
    return;
  }
  if (!article) return showNotFound();

  applySeo(article);
  renderArticle(article);
  renderShare(article);
  countView(article);
  loadRelated(article);
}

function showNotFound() {
  document.title = "Artikel tidak ditemukan — Riakata";
  articleEl.innerHTML = emptyHtml("Artikel tidak ditemukan", "Alamatnya mungkin salah, atau artikel sudah diturunkan.") +
    `<p style="text-align:center"><a class="btn btn--primary" href="${href("/")}">Kembali ke beranda</a></p>`;
}

start();
