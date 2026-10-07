/* ==========================================================
   fb-cari.js — pencarian artikel (?q=kata)
   Firestore tidak punya pencarian teks penuh, jadi 200 artikel terbaru
   diambil lalu disaring di browser. Cukup untuk skala tugas ini;
   untuk skala besar gunakan layanan seperti Algolia/Typesense.
   ========================================================== */
import { fetchPublished, describeError } from "./articles.js";
import { cardHtml, emptyHtml, errorHtml, skeletonCards } from "./render.js";
import { getParam } from "./utils.js";

const $ = (id) => document.getElementById(id);
const gridEl = $("list-grid");
const statusEl = $("list-status");
const infoEl = $("result-info");
const inputEl = $("cari-q");

const q = (getParam("q") || "").trim();
inputEl.value = q;
document.title = q ? `Cari "${q}" — Riakata` : "Pencarian — Riakata";

const normalize = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Skor relevansi: judul paling berbobot. Semua kata kunci harus ditemukan. */
function score(article, terms) {
  const title = normalize(article.title);
  const excerpt = normalize(article.excerpt);
  const meta = normalize(`${(article.tags || []).join(" ")} ${article.authorName || ""} ${article.category || ""}`);
  let total = 0;
  for (const term of terms) {
    const inTitle = title.includes(term), inExcerpt = excerpt.includes(term), inMeta = meta.includes(term);
    if (!inTitle && !inExcerpt && !inMeta) return 0;
    total += (inTitle ? 3 : 0) + (inMeta ? 2 : 0) + (inExcerpt ? 1 : 0);
  }
  return total;
}

async function search() {
  if (!q) {
    infoEl.textContent = "Ketik kata kunci di atas untuk mulai mencari.";
    return;
  }
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  gridEl.innerHTML = skeletonCards(4);
  statusEl.innerHTML = "";
  infoEl.textContent = "Mencari...";

  try {
    const { items } = await fetchPublished({ pageSize: 200 });
    const results = items
      .map((a) => ({ a, s: score(a, terms) }))
      .filter((r) => r.s > 0)
      .sort((x, y) => y.s - x.s)
      .map((r) => r.a);

    gridEl.innerHTML = results.map(cardHtml).join("");
    infoEl.textContent = results.length ? `${results.length} hasil untuk "${q}"` : "";
    if (!results.length) statusEl.innerHTML = emptyHtml(`Tidak ada hasil untuk "${q}"`, "Coba kata kunci lain yang lebih umum.");
  } catch (err) {
    gridEl.innerHTML = "";
    infoEl.textContent = "";
    statusEl.innerHTML = errorHtml(describeError(err));
  }
}

statusEl.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) search(); });
search();