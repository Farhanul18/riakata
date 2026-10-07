/* ==========================================================
   fb-redaksi-artikel.js — kelola semua artikel (editor)
   Filter, cari, atur Headline & Pilihan Editor, arsipkan, hapus.
   ========================================================== */
import {
  db, doc, collection, query, limit, getDocs, writeBatch, serverTimestamp,
} from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { escapeHtml, timeAgo, STATUS_LABEL, statusClass, categoryName, showToast } from "./utils.js";

const { user, profile } = await requireRole(["editor"]);

const listEl = document.getElementById("work-list");
const tabsEl = document.getElementById("tabs");
const searchEl = document.getElementById("search");

const GROUPS = {
  all: { label: "Semua", match: () => true },
  queue: { label: "Antrean", match: (s) => ["submitted", "in_review"].includes(s) },
  approved: { label: "Disetujui", match: (s) => s === "approved" },
  published: { label: "Terbit", match: (s) => s === "published" },
  closed: { label: "Revisi / ditolak", match: (s) => ["needs_revision", "rejected"].includes(s) },
  archived: { label: "Arsip", match: (s) => s === "archived" },
};

let articles = [];
let activeTab = "all";
let busy = false;

const ms = (a) => a.updatedAt?.toMillis?.() ?? Date.now();
const inGroup = (key) => articles.filter((a) => GROUPS[key].match(a.status));

function visible() {
  const q = searchEl.value.trim().toLowerCase();
  return inGroup(activeTab).filter((a) => !q || `${a.title} ${a.authorName}`.toLowerCase().includes(q));
}

/* ---------- Render ---------- */
function renderTabs() {
  tabsEl.innerHTML = Object.entries(GROUPS)
    .map(([key, g]) => `<button class="tab" type="button" data-tab="${key}" aria-pressed="${key === activeTab}">${g.label}<span class="tab__count">${inGroup(key).length}</span></button>`)
    .join("");
}

function rowHtml(a) {
  let actions = `<a class="btn btn--outline btn--sm" href="/redaksi/review.html?id=${a.id}">${["submitted", "in_review"].includes(a.status) ? "Review" : "Buka"}</a>`;
  if (a.status === "published") {
    actions += `
      <button class="btn btn--outline btn--sm btn--toggle" type="button" data-action="headline" data-id="${a.id}" aria-pressed="${!!a.isHeadline}">Headline</button>
      <button class="btn btn--outline btn--sm btn--toggle" type="button" data-action="pick" data-id="${a.id}" aria-pressed="${!!a.isEditorPick}">Pilihan Editor</button>
      <button class="btn btn--ghost btn--sm" type="button" data-action="archive" data-id="${a.id}">Arsipkan</button>`;
  }
  if (["archived", "rejected"].includes(a.status)) {
    actions += `<button class="btn btn--ghost btn--sm" type="button" data-action="delete" data-id="${a.id}">Hapus</button>`;
  }
  return `
    <article class="work-item">
      <div>
        <h2 class="work-item__title"><a href="/redaksi/review.html?id=${a.id}">${escapeHtml(a.title || "(Tanpa judul)")}</a></h2>
        <div class="work-item__meta">
          <span class="badge badge--${escapeHtml(a.category)}">${escapeHtml(categoryName(a.category))}</span>
          <span>${escapeHtml(a.authorName || "-")}</span>
          <span>Diperbarui ${escapeHtml(timeAgo(a.updatedAt) || "baru saja")}</span>
          ${a.status === "published" ? `<span>${a.views || 0} dibaca</span>` : ""}
        </div>
      </div>
      <span class="${statusClass(a.status)}">${escapeHtml(STATUS_LABEL[a.status] || a.status)}</span>
      <div class="work-item__actions">${actions}</div>
    </article>`;
}

function renderList() {
  const rows = visible();
  listEl.innerHTML = rows.length
    ? rows.map(rowHtml).join("")
    : `<div class="empty"><p class="empty__title">Tidak ada artikel</p><p>Coba ganti filter atau kata pencarian.</p></div>`;
}

const renderAll = () => { renderTabs(); renderList(); };

/* ---------- Muat ---------- */
async function load() {
  try {
    const snap = await getDocs(query(collection(db, "articles"), limit(300)));
    // Draft jurnalis bersifat pribadi, tidak ditampilkan
    articles = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.status !== "draft").sort((a, b) => ms(b) - ms(a));
    renderAll();
  } catch (err) {
    console.error("[artikel redaksi]", err);
    const denied = err.code === "permission-denied";
    listEl.innerHTML = `<div class="alert alert--error">${denied ? "Tidak punya izin membaca artikel. Periksa Firestore Rules dan role akun." : "Gagal memuat artikel."} <button class="link-btn" type="button" id="retry">Coba lagi</button></div>`;
    document.getElementById("retry")?.addEventListener("click", load);
  }
}

/* ---------- Aksi ---------- */
const find = (id) => articles.find((a) => a.id === id);

async function setHeadline(a) {
  const turnOn = !a.isHeadline;
  const batch = writeBatch(db);
  // Hanya boleh ada satu headline: matikan yang lama
  if (turnOn) articles.filter((x) => x.isHeadline && x.id !== a.id).forEach((x) => batch.update(doc(db, "articles", x.id), { isHeadline: false }));
  batch.update(doc(db, "articles", a.id), { isHeadline: turnOn });
  await batch.commit();
  articles.forEach((x) => { x.isHeadline = turnOn && x.id === a.id; });
  showToast(turnOn ? "Dijadikan headline beranda." : "Headline dilepas.", "success");
}

async function togglePick(a) {
  const batch = writeBatch(db);
  batch.update(doc(db, "articles", a.id), { isEditorPick: !a.isEditorPick });
  await batch.commit();
  a.isEditorPick = !a.isEditorPick;
  showToast(a.isEditorPick ? "Masuk Pilihan Editor." : "Dikeluarkan dari Pilihan Editor.", "success");
}

async function archive(a) {
  if (!confirm(`Arsipkan "${a.title}"? Artikel tidak akan tampil di situs.`)) return;
  const batch = writeBatch(db);
  batch.update(doc(db, "articles", a.id), { status: "archived", isHeadline: false, isEditorPick: false, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, "articles", a.id, "revisions")), {
    fromStatus: a.status, toStatus: "archived", note: "",
    byUid: user.uid, byName: profile.name || user.email, createdAt: serverTimestamp(),
  });
  await batch.commit();
  Object.assign(a, { status: "archived", isHeadline: false, isEditorPick: false, updatedAt: null });
  showToast("Artikel diarsipkan.", "success");
}

async function remove(a) {
  if (!confirm(`Hapus permanen "${a.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  const revs = await getDocs(collection(db, "articles", a.id, "revisions"));
  const batch = writeBatch(db);
  revs.docs.forEach((r) => batch.delete(r.ref));
  batch.delete(doc(db, "articles", a.id));
  await batch.commit();
  articles = articles.filter((x) => x.id !== a.id);
  showToast("Artikel dihapus.", "success");
}

const ACTIONS = { headline: setHeadline, pick: togglePick, archive, delete: remove };

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || busy) return;
  const article = find(btn.dataset.id);
  if (!article) return;

  busy = true;
  btn.disabled = true;
  try {
    await ACTIONS[btn.dataset.action](article);
  } catch (err) {
    console.error("[aksi artikel]", err);
    showToast(err.code === "permission-denied" ? "Tidak punya izin. Periksa Firestore Rules." : "Aksi gagal. Coba lagi.", "error");
  } finally {
    busy = false;
    renderAll();
  }
});

tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  activeTab = btn.dataset.tab;
  renderAll();
});
searchEl.addEventListener("input", renderList);

load();
