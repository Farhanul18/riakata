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
