/* ==========================================================
   fb-daftar.js — satu halaman untuk Terkini, Terpopuler, Pilihan Editor, dan Tag
   Dikenali dari ?tipe=... (lokal) atau alamat cantik (/terkini, /tag/batik).
   ========================================================== */
import { fetchPublished } from "./articles.js";
import { mountArticleList } from "./render.js";
import { getParam, href, slugify, escapeHtml } from "./utils.js";

const $ = (id) => document.getElementById(id);

function detect() {
  const fromQuery = getParam("tipe");
  if (fromQuery) return { tipe: fromQuery, tag: getParam("t") || "" };
  const [first, second] = location.pathname.split("/").filter(Boolean);
  if (first === "tag") return { tipe: "tag", tag: decodeURIComponent(second || "") };
  if (first === "pilihan-editor") return { tipe: "pilihan", tag: "" };
  return { tipe: first === "terpopuler" ? "terpopuler" : "terkini", tag: "" };
}

const { tipe, tag: rawTag } = detect();
const tag = slugify(rawTag);

const TYPES = {
  terkini: { title: "Terkini", desc: "Semua artikel terbaru dari Riakata.", path: "/terkini", query: { order: "publishedAt" } },
  terpopuler: { title: "Terpopuler", desc: "Artikel yang paling banyak dibaca.", path: "/terpopuler", query: { order: "views" } },
  pilihan: { title: "Pilihan Editor", desc: "Tulisan pilihan yang dikurasi redaksi.", path: "/pilihan-editor", query: { pick: true } },
  tag: { title: `#${tag}`, desc: `Artikel dengan tag #${tag}.`, path: "", query: { tag } },
};
const type = TYPES[tipe] || TYPES.terkini;

document.title = `${type.title} — Riakata`;
document.querySelector('meta[name="description"]')?.setAttribute("content", type.desc);
$("page-heading").textContent = type.title;
$("crumb").textContent = type.title;
$("page-desc").textContent = type.desc;

$("switcher").innerHTML = ["terkini", "terpopuler", "pilihan"]
  .map((key) => {
    const t = TYPES[key];
    const active = key === tipe || (!TYPES[tipe] && key === "terkini");
    return `<a class="chip${active ? " chip--active" : ""}" href="${href(t.path)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(t.title)}</a>`;
  })
  .join("");

if (tipe === "tag" && !tag) {
  $("page-heading").textContent = "Tag tidak ditemukan";
  $("list-grid").innerHTML = "";
} else {
  mountArticleList({
    listEl: $("list-grid"),
    statusEl: $("list-status"),
    moreBtn: $("load-more"),
    fetchPage: (cursor) => fetchPublished({ ...type.query, cursor, pageSize: 12 }),
    emptyTitle: "Belum ada artikel",
    emptyText: "Coba lagi nanti, atau lihat daftar lain.",
  })();
}