/* ==========================================================
   fb-jurnalis-dashboard.js — daftar artikel milik jurnalis
   Membaca articles where authorId == uid. Pengurutan dilakukan di browser
   (jumlah artikel per jurnalis kecil) supaya tidak butuh index Firestore.
   ========================================================== */
import { db, collection, query, where, limit, getDocs, doc, deleteDoc } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { escapeHtml, timeAgo, getParam, STATUS_LABEL, statusClass, categoryName, showToast } from "./utils.js";

const { user } = await requireRole(["journalist"]);

const listEl = document.getElementById("work-list");
const statsEl = document.getElementById("stats");
const tabsEl = document.getElementById("tabs");
const noticeEl = document.getElementById("notice");

const GROUPS = {
  all: { label: "Semua", match: () => true },
  draft: { label: "Draft", match: (s) => s === "draft" },
  process: { label: "Diproses", match: (s) => ["submitted", "in_review", "approved"].includes(s) },
  revision: { label: "Perlu revisi", match: (s) => s === "needs_revision" },
  published: { label: "Terbit", match: (s) => s === "published" },
  closed: { label: "Ditolak / arsip", match: (s) => ["rejected", "archived"].includes(s) },
};

let articles = [];
let activeTab = "all";

const millis = (a) => a.updatedAt?.toMillis?.() ?? Date.now();
const count = (key) => articles.filter((a) => GROUPS[key].match(a.status)).length;

/* ---------- Render ---------- */
function renderStats() {
  const items = [
    ["Total artikel", articles.length],
    ["Draft", count("draft")],
    ["Diproses redaksi", count("process")],
    ["Perlu revisi", count("revision")],
    ["Terbit", count("published")],
  ];
  statsEl.innerHTML = items
    .map(([label, value]) => `<div class="stat"><div class="stat__value">${value}</div><div class="stat__label">${label}</div></div>`)
    .join("");
}

function renderTabs() {
  tabsEl.innerHTML = Object.entries(GROUPS)
    .map(([key, g]) => `<button class="tab" type="button" data-tab="${key}" aria-pressed="${key === activeTab}">${g.label}<span class="tab__count">${count(key)}</span></button>`)
    .join("");
}

function rowHtml(a) {
  const editable = ["draft", "needs_revision"].includes(a.status);
  const showNote = ["needs_revision", "rejected"].includes(a.status) && a.editorNote;

  let actions;
  if (a.status === "published") {
    actions = `<a class="btn btn--outline btn--sm" href="/artikel.html?slug=${encodeURIComponent(a.slug)}" target="_blank" rel="noopener">Lihat</a>`;
  } else if (editable) {
    actions = `<a class="btn btn--outline btn--sm" href="/jurnalis/tulis.html?id=${a.id}">${a.status === "needs_revision" ? "Revisi" : "Edit"}</a>`;
    if (a.status === "draft") actions += `<button class="btn btn--ghost btn--sm" type="button" data-delete="${a.id}">Hapus</button>`;
  } else {
    actions = `<a class="btn btn--outline btn--sm" href="/jurnalis/tulis.html?id=${a.id}">Buka</a>`;
  }

  return `
    <article class="work-item">
      <div>
        <h2 class="work-item__title"><a href="/jurnalis/tulis.html?id=${a.id}">${escapeHtml(a.title || "(Tanpa judul)")}</a></h2>
        <div class="work-item__meta">
          <span class="badge badge--${escapeHtml(a.category)}">${escapeHtml(categoryName(a.category))}</span>
          <span>Diperbarui ${escapeHtml(timeAgo(a.updatedAt) || "baru saja")}</span>
        </div>
        ${showNote ? `<p class="work-item__note"><strong>Catatan editor:</strong> ${escapeHtml(a.editorNote)}</p>` : ""}
      </div>
      <span class="${statusClass(a.status)}">${escapeHtml(STATUS_LABEL[a.status] || a.status)}</span>
      <div class="work-item__actions">${actions}</div>
    </article>`;
}

function renderList() {
  const rows = articles.filter((a) => GROUPS[activeTab].match(a.status));
  if (!rows.length) {
    listEl.innerHTML = articles.length
      ? `<div class="empty"><p class="empty__title">Tidak ada artikel di filter ini</p></div>`
      : `<div class="empty"><p class="empty__title">Belum ada artikel</p><p>Mulai dengan menulis artikel pertamamu.</p><p style="margin-top:var(--space-4)"><a class="btn btn--primary" href="/jurnalis/tulis.html">Tulis Artikel</a></p></div>`;
    return;
  }
  listEl.innerHTML = rows.map(rowHtml).join("");
}

function renderAll() {
  renderStats();
  renderTabs();
  renderList();
}

/* ---------- Muat data ---------- */
async function load() {
  try {
    const snap = await getDocs(query(collection(db, "articles"), where("authorId", "==", user.uid), limit(100)));
    articles = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b) - millis(a));
    renderAll();
  } catch (err) {
    console.error("[dashboard jurnalis]", err);
    statsEl.innerHTML = "";
    tabsEl.innerHTML = "";
    const denied = err.code === "permission-denied";
    listEl.innerHTML = `<div class="alert alert--error">${denied ? "Tidak punya izin membaca artikel. Periksa Firestore Rules." : "Gagal memuat artikel. Periksa koneksi lalu coba lagi."} <button class="link-btn" type="button" id="retry">Coba lagi</button></div>`;
    document.getElementById("retry")?.addEventListener("click", load);
  }
}

/* ---------- Interaksi ---------- */
tabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  activeTab = btn.dataset.tab;
  renderTabs();
  renderList();
});

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete]");
  if (!btn) return;
  const article = articles.find((a) => a.id === btn.dataset.delete);
  if (!article || !confirm(`Hapus draft "${article.title || "(Tanpa judul)"}"? Tindakan ini tidak bisa dibatalkan.`)) return;

  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "articles", article.id));
    articles = articles.filter((a) => a.id !== article.id);
    renderAll();
    showToast("Draft dihapus.", "success");
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    showToast("Gagal menghapus draft.", "error");
  }
});

/* Pesan setelah mengirim artikel dari halaman tulis */
if (getParam("notice") === "submitted") {
  noticeEl.hidden = false;
  noticeEl.className = "alert alert--success";
  noticeEl.style.marginBottom = "var(--space-5)";
  noticeEl.textContent = "Artikel berhasil dikirim ke redaksi. Kamu akan melihat statusnya di sini.";
  history.replaceState(null, "", location.pathname);
}

load();
