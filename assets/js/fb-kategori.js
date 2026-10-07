/* ==========================================================
   fb-kategori.js — daftar artikel per kategori (?k=budaya atau /kategori/budaya)
   ========================================================== */
import { fetchPublished, fetchCategories } from "./articles.js";
import { mountArticleList, categoryUrl } from "./render.js";
import { routeParam, escapeHtml, categoryName } from "./utils.js";

const DESCRIPTIONS = {
  budaya: "Cerita tentang budaya Indonesia yang hidup di tengah zaman.",
  tradisi: "Warisan dan kebiasaan turun-temurun yang masih dijaga.",
  seni: "Tari, musik, pertunjukan, dan karya seni dari berbagai daerah.",
  "gaya-hidup": "Makanan, kebiasaan, dan cara hidup yang membentuk keseharian kita.",
  tokoh: "Orang-orang yang merawat dan memajukan budaya Indonesia.",
  opini: "Sudut pandang dan gagasan tentang budaya hari ini.",
};

const slug = routeParam("k", "/kategori");
const $ = (id) => document.getElementById(id);

const categories = await fetchCategories();
const current = categories.find((c) => c.slug === slug);
const name = current?.name || categoryName(slug);
const description = current?.description || DESCRIPTIONS[slug] || `Kumpulan artikel ${name}.`;

document.title = `${name} — Riakata`;
document.querySelector('meta[name="description"]')?.setAttribute("content", description);
$("page-heading").textContent = name;
$("page-desc").textContent = description;
$("switcher").innerHTML = categories
  .map((c) => `<a class="chip${c.slug === slug ? " chip--active" : ""}" href="${categoryUrl(c.slug)}"${c.slug === slug ? ' aria-current="page"' : ""}>${escapeHtml(c.name)}</a>`)
  .join("");

if (!slug) {
  $("page-heading").textContent = "Kategori tidak ditemukan";
  $("list-grid").innerHTML = "";
} else {
  mountArticleList({
    listEl: $("list-grid"),
    statusEl: $("list-status"),
    moreBtn: $("load-more"),
    fetchPage: (cursor) => fetchPublished({ category: slug, cursor, pageSize: 12 }),
    emptyTitle: `Belum ada artikel di ${name}`,
    emptyText: "Coba kategori lain atau kembali lagi nanti.",
  })();
}