/* ==========================================================
   articles.js — query artikel untuk halaman PUBLIK
   Semua query WAJIB memakai where("status", "==", "published")
   (itu syarat Firestore Rules untuk pengunjung tanpa login).
   Query gabungan butuh index; kalau muncul error "failed-precondition",
   klik tautan di Console untuk membuat index otomatis.
   ========================================================== */
import {
  db, collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter,
} from "./firebase-config.js";
import { DEFAULT_CATEGORIES } from "./utils.js";

const articlesRef = () => collection(db, "articles");
const toItem = (d) => ({ id: d.id, ...d.data() });

/**
 * Daftar artikel terbit dengan paginasi.
 * opsi: category, tag, pick (Pilihan Editor), order ("publishedAt" | "views"), pageSize, cursor
 * Mengembalikan { items, cursor, hasMore }. Kirim `cursor` untuk halaman berikutnya.
 */
export async function fetchPublished({ category, tag, pick = false, order = "publishedAt", pageSize = 12, cursor = null } = {}) {
  const rules = [where("status", "==", "published")];
  if (category) rules.push(where("category", "==", category));
  if (tag) rules.push(where("tags", "array-contains", tag));
  if (pick) rules.push(where("isEditorPick", "==", true));
  rules.push(orderBy(order, "desc"));
  if (cursor) rules.push(startAfter(cursor));
  rules.push(limit(pageSize + 1)); // +1 untuk tahu masih ada halaman berikutnya

  const snap = await getDocs(query(articlesRef(), ...rules));
  const page = snap.docs.slice(0, pageSize);
  return { items: page.map(toItem), cursor: page[page.length - 1] || null, hasMore: snap.docs.length > pageSize };
}

export async function fetchHeadline() {
  const snap = await getDocs(query(articlesRef(), where("status", "==", "published"), where("isHeadline", "==", true), limit(1)));
  return snap.empty ? null : toItem(snap.docs[0]);
}

export async function fetchBySlug(slug) {
  const snap = await getDocs(query(articlesRef(), where("status", "==", "published"), where("slug", "==", slug), limit(1)));
  return snap.empty ? null : toItem(snap.docs[0]);
}

/** settings/site: { hotTopics: [...] }. Gagal = objek kosong. */
export async function fetchSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    return snap.exists() ? snap.data() : {};
  } catch (err) {
    console.warn("[settings]", err.code || err);
    return {};
  }
}

/** Kategori dari Firestore; kalau kosong atau gagal, pakai daftar bawaan. */
export async function fetchCategories() {
  try {
    const snap = await getDocs(query(collection(db, "categories"), orderBy("order")));
    const list = snap.docs.map((d) => ({ slug: d.data().slug || d.id, name: d.data().name, description: d.data().description || "" }));
    return list.length ? list : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

/** Pesan error yang ramah untuk ditampilkan ke pembaca. */
export function describeError(err) {
  console.error("[articles]", err);
  if (err?.code === "failed-precondition") return "Index Firestore belum dibuat. Buka Console browser (F12), klik tautan pembuatan index, lalu tunggu beberapa menit.";
  if (err?.code === "permission-denied") return "Data tidak bisa dibaca. Periksa Firestore Rules.";
  return "Gagal memuat data. Periksa koneksi lalu coba lagi.";
}
