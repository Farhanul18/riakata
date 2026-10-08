/* ==========================================================
   utils.js — fungsi bantu umum. Hanya di sini, jangan diduplikasi.
   ========================================================== */

/** Halaman beranda tiap peran, dan folder yang boleh diakses tiap peran. */
export const ROLE_HOME = {
  editor: "/redaksi/dashboard.html",
  journalist: "/jurnalis/dashboard.html",
};
export const ROLE_AREA = { editor: "/redaksi/", journalist: "/jurnalis/" };
export const ROLE_LABEL = { editor: "Redaktur", journalist: "Jurnalis" };

/** Ambil parameter dari alamat, contoh: getParam("slug"). */
export function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

/**
 * Validasi alamat tujuan setelah login (?next=...).
 * Hanya boleh alamat internal DAN masih di area milik peran tersebut.
 * Mencegah open-redirect ke situs luar.
 */
export function safeNextPath(raw, role) {
  if (!raw || !ROLE_AREA[role]) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw.startsWith(ROLE_AREA[role]) ? raw : null;
}

/** Cegah XSS: wajib dipakai sebelum memasukkan teks dari database ke innerHTML. */
export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** "Warung Legendaris yang Masih Eksis!" -> "warung-legendaris-yang-masih-eksis" */
export function slugify(text = "") {
  return text
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Perkiraan menit baca dari HTML isi artikel (200 kata per menit, minimal 1). */
export function readingTime(html = "") {
  const text = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();
  const words = text ? text.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(words / 200));
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Ubah Timestamp Firestore / Date / angka menjadi Date. */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 12 Apr 2025 */
export function formatDate(value) {
  const d = toDate(value);
  return d ? `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}` : "";
}

/** "5 menit lalu", "2 jam lalu"; lebih dari 24 jam memakai tanggal biasa. */
export function timeAgo(value) {
  const d = toDate(value);
  if (!d) return "";
  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} jam lalu`;
  return formatDate(d);
}

/** Sisipkan transformasi Cloudinary, contoh: cloudinaryUrl(url, "f_auto,q_auto,w_800"). */
export function cloudinaryUrl(url, transform = "f_auto,q_auto,w_800") {
  if (!url || !url.includes("/upload/")) return url || "";
  return url.replace("/upload/", `/upload/${transform}/`);
}

/* ---------- Tambahan Tahap 4: status artikel, kategori, toast ---------- */

export const STATUS_LABEL = {
  draft: "Draft",
  submitted: "Diajukan",
  in_review: "Sedang direview",
  needs_revision: "Perlu revisi",
  approved: "Disetujui",
  published: "Terbit",
  rejected: "Ditolak",
  archived: "Diarsipkan",
};

/** "needs_revision" -> "status status--needs-revision" (kelas CSS di components.css) */
export function statusClass(status) {
  return `status status--${String(status).replace(/_/g, "-")}`;
}

/** Cadangan kalau koleksi `categories` di Firestore masih kosong. */
export const DEFAULT_CATEGORIES = [
  { slug: "budaya", name: "Budaya" },
  { slug: "tradisi", name: "Tradisi" },
  { slug: "seni", name: "Seni" },
  { slug: "gaya-hidup", name: "Gaya Hidup" },
  { slug: "tokoh", name: "Tokoh" },
  { slug: "opini", name: "Opini" },
];

export function categoryName(slug) {
  return DEFAULT_CATEGORIES.find((c) => c.slug === slug)?.name || slug || "-";
}

/** Notifikasi kecil di bawah layar. type: "info" | "success" | "error" */
export function showToast(message, type = "info", ms = 4500) {
  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  setTimeout(() => toast.remove(), ms);
}

/* ---------- Tambahan Tahap 5: sanitasi HTML artikel ---------- */

const ALLOWED_TAGS = new Set(["P", "BR", "H2", "H3", "H4", "STRONG", "B", "EM", "I", "U", "S", "BLOCKQUOTE", "UL", "OL", "LI", "A", "IMG", "HR"]);
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "SVG", "MATH", "NOSCRIPT", "TEMPLATE"]);

function safeUrl(value, protocols) {
  try {
    const url = new URL(value, location.origin);
    return protocols.includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

/**
 * Bersihkan HTML dari editor sebelum ditampilkan (cegah XSS).
 * Hanya tag dan atribut aman yang dipertahankan. Wajib dipakai untuk `content` artikel.
 */
export function sanitizeHtml(html = "") {
  const doc = new DOMParser().parseFromString(String(html), "text/html");

  const clean = (parent) => {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === 3) return; // teks biasa
      if (node.nodeType !== 1) return node.remove(); // komentar dll.

      const tag = node.tagName;
      if (DROP_TAGS.has(tag)) return node.remove();

      clean(node);
      if (!ALLOWED_TAGS.has(tag)) return node.replaceWith(...node.childNodes); // buang tag, simpan isinya

      [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const keep = (tag === "A" && name === "href") || (tag === "IMG" && ["src", "alt", "width", "height"].includes(name));
        if (!keep) node.removeAttribute(attr.name);
      });

      if (tag === "A") {
        const href = safeUrl(node.getAttribute("href") || "", ["http:", "https:", "mailto:"]);
        if (href) {
          node.setAttribute("href", href);
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        } else node.removeAttribute("href");
      }
      if (tag === "IMG") {
        const src = node.getAttribute("src") || "";
        if (!src.startsWith("https://") || !safeUrl(src, ["https:"])) return node.remove();
        node.setAttribute("loading", "lazy");
        node.setAttribute("decoding", "async");
        if (!node.hasAttribute("alt")) node.setAttribute("alt", "");
      }
    });
  };

  clean(doc.body);
  return doc.body.innerHTML;
}

/* ---------- Tambahan Tahap 6: alamat (URL) halaman publik ---------- */

/** true saat dibuka dari komputer sendiri (Live Server dll.), yang belum punya redirect Netlify. */
export const IS_LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || location.protocol === "file:";

const LOCAL_ROUTES = [
  [/^\/artikel\/([^/?#]+)$/, (m) => `/artikel.html?slug=${m[1]}`],
  [/^\/kategori\/([^/?#]+)$/, (m) => `/kategori.html?k=${m[1]}`],
  [/^\/tag\/([^/?#]+)$/, (m) => `/daftar.html?tipe=tag&t=${m[1]}`],
  [/^\/penulis\/([^/?#]+)$/, (m) => `/penulis.html?id=${m[1]}`],
  [/^\/(terkini|terpopuler)$/, (m) => `/daftar.html?tipe=${m[1]}`],
  [/^\/pilihan-editor$/, () => "/daftar.html?tipe=pilihan"],
  [/^\/(tentang|pedoman|kontak|privasi|tim-redaksi|cari)(\?.*)?$/, (m) => `/${m[1]}.html${m[2] || ""}`],
];

/**
 * Alamat cantik untuk produksi (/artikel/judul), alamat berkas untuk lokal (/artikel.html?slug=judul).
 * Semua tautan buatan JavaScript wajib dibungkus fungsi ini.
 */
export function href(path) {
  if (!IS_LOCAL) return path;
  for (const [pattern, build] of LOCAL_ROUTES) {
    const match = path.match(pattern);
    if (match) return build(match);
  }
  return path;
}

/** Ambil nilai dari ?nama=... atau dari alamat cantik /awalan/nilai. */
export function routeParam(queryName, pathPrefix) {
  const fromQuery = getParam(queryName);
  if (fromQuery) return fromQuery;
  const prefix = `${pathPrefix}/`;
  if (!location.pathname.startsWith(prefix)) return null;
  const value = location.pathname.slice(prefix.length).split("/")[0];
  return value ? decodeURIComponent(value) : null;
}

export const CATEGORY_DESCRIPTIONS = {
  budaya: "Cerita tentang budaya Indonesia yang hidup di tengah zaman.",
  tradisi: "Warisan dan kebiasaan turun-temurun yang masih dijaga.",
  seni: "Tari, musik, pertunjukan, dan karya seni dari berbagai daerah.",
  "gaya-hidup": "Makanan, kebiasaan, dan cara hidup yang membentuk keseharian kita.",
  tokoh: "Orang-orang yang merawat dan memajukan budaya Indonesia.",
  opini: "Sudut pandang dan gagasan tentang budaya hari ini.",
};