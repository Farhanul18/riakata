/* ==========================================================
   fb-redaksi-kategori.js — kelola kategori dan Topik Hangat (editor)
   Kategori: koleksi "categories" (ID dokumen = slug). Topik: settings/site.hotTopics.
   ========================================================== */
import {
  db, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, writeBatch,
} from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { escapeHtml, slugify, showToast, DEFAULT_CATEGORIES, CATEGORY_DESCRIPTIONS } from "./utils.js";

await requireRole(["editor"]);

const $ = (id) => document.getElementById(id);
const listEl = $("cat-list");
const seedBox = $("seed-box");
const dialog = $("edit-dialog");

let cats = [];
let editing = null;
let busy = false;

/* ---------- Kategori ---------- */
function render() {
  seedBox.hidden = cats.length > 0;
  listEl.innerHTML = cats.length
    ? cats.map((c, i) => `<article class="work-item">
        <div>
          <h3 class="work-item__title">${escapeHtml(c.name)}</h3>
          <div class="work-item__meta"><span>/kategori/${escapeHtml(c.slug)}</span></div>
          ${c.description ? `<p class="text-muted" style="margin-top:var(--space-2);font-size:var(--text-sm)">${escapeHtml(c.description)}</p>` : ""}
        </div>
        <span class="status">Urutan ${i + 1}</span>
        <div class="work-item__actions">
          <button class="btn btn--outline btn--sm" type="button" data-act="up" data-id="${c.id}" aria-label="Naikkan ${escapeHtml(c.name)}" ${i === 0 ? "disabled" : ""}>Naik</button>
          <button class="btn btn--outline btn--sm" type="button" data-act="down" data-id="${c.id}" aria-label="Turunkan ${escapeHtml(c.name)}" ${i === cats.length - 1 ? "disabled" : ""}>Turun</button>
          <button class="btn btn--outline btn--sm" type="button" data-act="edit" data-id="${c.id}">Edit</button>
          <button class="btn btn--ghost btn--sm" type="button" data-act="delete" data-id="${c.id}">Hapus</button>
        </div>
      </article>`).join("")
    : `<div class="empty"><p class="empty__title">Belum ada kategori tersimpan</p></div>`;
}

async function load() {
  try {
    const snap = await getDocs(query(collection(db, "categories"), orderBy("order")));
    cats = snap.docs.map((d) => ({ id: d.id, slug: d.id, ...d.data() }));
    render();
  } catch (err) {
    console.error("[kategori]", err);
    listEl.innerHTML = `<div class="alert alert--error">Gagal memuat kategori. Periksa Firestore Rules dan koneksi.</div>`;
  }
}

async function guarded(task, failMessage) {
  if (busy) return;
  busy = true;
  try { await task(); }
  catch (err) {
    console.error(err);
    showToast(err.code === "permission-denied" ? "Tidak punya izin. Periksa Firestore Rules." : failMessage, "error");
  } finally { busy = false; }
}

$("seed-btn").addEventListener("click", () => guarded(async () => {
  const batch = writeBatch(db);
  DEFAULT_CATEGORIES.forEach((c, i) => batch.set(doc(db, "categories", c.slug), {
    name: c.name, slug: c.slug, description: CATEGORY_DESCRIPTIONS[c.slug] || "", order: i + 1,
  }));
  await batch.commit();
  showToast("Kategori bawaan tersimpan.", "success");
  await load();
}, "Gagal mengisi kategori."));

$("cat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("c-name").value.trim();
  const description = $("c-desc").value.trim();
  const slug = slugify(name);
  if (name.length < 2) return showToast("Nama kategori minimal 2 karakter.", "error");
  if (!slug) return showToast("Nama tidak valid.", "error");
  if (cats.some((c) => c.slug === slug)) return showToast("Kategori itu sudah ada.", "error");

  guarded(async () => {
    const order = cats.length ? Math.max(...cats.map((c) => c.order || 0)) + 1 : 1;
    await setDoc(doc(db, "categories", slug), { name, slug, description, order });
    e.target.reset();
    showToast("Kategori ditambahkan.", "success");
    await load();
  }, "Gagal menambah kategori.");
});

async function move(id, dir) {
  const i = cats.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  const batch = writeBatch(db); // nomor urut dirapikan 1..n
  cats.forEach((c, idx) => { if (c.order !== idx + 1) { c.order = idx + 1; batch.update(doc(db, "categories", c.id), { order: idx + 1 }); } });
  await batch.commit();
  render();
}

async function remove(cat) {
  const used = await getDocs(query(collection(db, "articles"), where("category", "==", cat.slug), limit(1)));
  if (!used.empty) return showToast(`"${cat.name}" masih dipakai artikel, jadi tidak bisa dihapus.`, "error");
  if (!confirm(`Hapus kategori "${cat.name}"?`)) return;
  await deleteDoc(doc(db, "categories", cat.id));
  cats = cats.filter((c) => c.id !== cat.id);
  render();
  showToast("Kategori dihapus.", "success");
}

listEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const cat = cats.find((c) => c.id === btn.dataset.id);
  if (!cat) return;
  const act = btn.dataset.act;
  if (act === "edit") {
    editing = cat;
    $("e-name").value = cat.name;
    $("e-desc").value = cat.description || "";
    $("e-slug").textContent = cat.slug;
    dialog.showModal();
    return;
  }
  guarded(() => (act === "delete" ? remove(cat) : move(cat.id, act === "up" ? -1 : 1)), "Aksi gagal.");
});

$("e-cancel").addEventListener("click", () => dialog.close());
$("edit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("e-name").value.trim();
  if (name.length < 2) return showToast("Nama kategori minimal 2 karakter.", "error");
  guarded(async () => {
    const description = $("e-desc").value.trim();
    await updateDoc(doc(db, "categories", editing.id), { name, description });
    Object.assign(editing, { name, description });
    dialog.close();
    render();
    showToast("Kategori diperbarui.", "success");
  }, "Gagal menyimpan.");
});

/* ---------- Topik Hangat ---------- */
async function loadTopics() {
  try {
    const snap = await getDoc(doc(db, "settings", "site"));
    $("h-topics").value = ((snap.exists() && snap.data().hotTopics) || []).join(", ");
  } catch (err) {
    console.warn("[topik]", err.code || err);
  }
}

$("hot-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const topics = [...new Set($("h-topics").value.split(",").map((t) => slugify(t)).filter(Boolean))].slice(0, 8);
  guarded(async () => {
    await setDoc(doc(db, "settings", "site"), { hotTopics: topics }, { merge: true });
    $("h-topics").value = topics.join(", ");
    showToast("Topik Hangat disimpan.", "success");
  }, "Gagal menyimpan topik.");
});

load();
loadTopics();
