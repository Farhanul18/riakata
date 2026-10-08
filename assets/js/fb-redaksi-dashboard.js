/* ==========================================================
   fb-redaksi-dashboard.js — ringkasan untuk redaktur
   Memuat artikel sekali (maks 300), lalu menghitung dan memilah di browser.
   ========================================================== */
import { db, doc, collection, query, where, limit, getDocs, updateDoc, serverTimestamp } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { escapeHtml, timeAgo, formatDate, STATUS_LABEL, statusClass, categoryName, showToast } from "./utils.js";

const { user } = await requireRole(["editor"]);

const statsEl = document.getElementById("stats");
const queueEl = document.getElementById("queue-list");
const approvedEl = document.getElementById("approved-list");
const publishedEl = document.getElementById("published-list");
const issuesEl = document.getElementById("issues-list");

const ms = (v) => v?.toMillis?.() ?? 0;

function rowHtml(a, timeField, timeLabel, actionLabel) {
  return `
    <article class="work-item">
      <div>
        <h3 class="work-item__title"><a href="/redaksi/review.html?id=${a.id}">${escapeHtml(a.title || "(Tanpa judul)")}</a></h3>
        <div class="work-item__meta">
          <span class="badge badge--${escapeHtml(a.category)}">${escapeHtml(categoryName(a.category))}</span>
          <span>${escapeHtml(a.authorName || "-")}</span>
          <span>${timeLabel} ${escapeHtml(timeAgo(a[timeField]) || "baru saja")}</span>
        </div>
      </div>
      <span class="${statusClass(a.status)}">${escapeHtml(STATUS_LABEL[a.status] || a.status)}</span>
      <div class="work-item__actions"><a class="btn btn--outline btn--sm" href="/redaksi/review.html?id=${a.id}">${actionLabel}</a></div>
    </article>`;
}

function fill(el, items, emptyText, build) {
  el.innerHTML = items.length
    ? items.map(build).join("")
    : `<div class="empty"><p>${emptyText}</p></div>`;
}

function render(articles) {
  const by = (...s) => articles.filter((a) => s.includes(a.status));
  const queue = by("submitted", "in_review").sort((a, b) => (ms(a.submittedAt) || ms(a.updatedAt)) - (ms(b.submittedAt) || ms(b.updatedAt)));
  const approved = by("approved").sort((a, b) => ms(b.updatedAt) - ms(a.updatedAt));
  const published = by("published").sort((a, b) => ms(b.publishedAt) - ms(a.publishedAt));
  const totalViews = published.reduce((sum, a) => sum + (a.views || 0), 0);

  const stats = [
    ["Antrean review", queue.length],
    ["Perlu revisi", by("needs_revision").length],
    ["Siap terbit", approved.length],
    ["Sudah terbit", published.length],
    ["Total dibaca", totalViews.toLocaleString("id-ID")],
  ];
  statsEl.innerHTML = stats
    .map(([label, value]) => `<div class="stat"><div class="stat__value">${value}</div><div class="stat__label">${label}</div></div>`)
    .join("");

  fill(queueEl, queue, "Tidak ada artikel yang menunggu review.", (a) => rowHtml(a, "submittedAt", "Dikirim", "Review"));
  fill(approvedEl, approved, "Belum ada artikel yang disetujui dan menunggu terbit.", (a) => rowHtml(a, "updatedAt", "Disetujui", "Buka"));
  fill(publishedEl, published.slice(0, 5), "Belum ada artikel terbit.", (a) => rowHtml(a, "publishedAt", "Terbit", "Buka"));
}

async function load() {
  try {
    const snap = await getDocs(query(collection(db, "articles"), limit(300)));
    // Draft jurnalis bersifat pribadi, tidak ditampilkan di sini
    render(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.status !== "draft"));
  } catch (err) {
    console.error("[dashboard redaksi]", err);
    statsEl.innerHTML = "";
    const denied = err.code === "permission-denied";
    queueEl.innerHTML = `<div class="alert alert--error">${denied ? "Tidak punya izin membaca artikel. Periksa Firestore Rules dan role akun." : "Gagal memuat data. Periksa koneksi lalu coba lagi."} <button class="link-btn" type="button" id="retry">Coba lagi</button></div>`;
    document.getElementById("retry")?.addEventListener("click", load);
  }
}

/* ---------- Usulan isu dari jurnalis ---------- */
let issues = [];

function issueHtml(i) {
  return `<article class="work-item">
    <div>
      <h3 class="work-item__title">${escapeHtml(i.title)}</h3>
      <p style="margin-top:var(--space-2);font-size:var(--text-sm)">${escapeHtml(i.summary)}</p>
      <p class="text-muted" style="margin-top:var(--space-2);font-size:var(--text-xs)"><strong>Mengapa penting:</strong> ${escapeHtml(i.reason)}</p>
      <div class="work-item__meta">
        <span>${escapeHtml(i.authorName || "-")}</span>
        <span>Dikirim ${escapeHtml(timeAgo(i.createdAt) || "baru saja")}</span>
        ${i.deadline ? `<span>Target ${escapeHtml(formatDate(i.deadline))}</span>` : ""}
      </div>
    </div>
    <span class="status status--submitted">Diajukan</span>
    <div class="work-item__actions">
      <button class="btn btn--primary btn--sm" type="button" data-issue="accepted" data-id="${i.id}">Terima</button>
      <button class="btn btn--outline btn--sm" type="button" data-issue="rejected" data-id="${i.id}">Tolak</button>
    </div>
  </article>`;
}

function renderIssues() {
  issuesEl.innerHTML = issues.length ? issues.map(issueHtml).join("") : '<div class="empty"><p>Tidak ada usulan isu yang menunggu.</p></div>';
}

async function loadIssues() {
  try {
    const snap = await getDocs(query(collection(db, "issues"), where("status", "==", "submitted"), limit(50)));
    issues = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    renderIssues();
  } catch (err) {
    console.error("[usulan isu]", err);
    issuesEl.innerHTML = '<div class="alert alert--error">Gagal memuat usulan isu. Periksa Firestore Rules.</div>';
  }
}

issuesEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-issue]");
  if (!btn) return;
  const to = btn.dataset.issue;
  const issue = issues.find((i) => i.id === btn.dataset.id);
  if (!issue) return;

  const note = window.prompt(to === "accepted" ? "Catatan untuk jurnalis (boleh kosong):" : "Alasan penolakan (wajib diisi):", "");
  if (note === null) return;
  if (to === "rejected" && !note.trim()) return showToast("Alasan penolakan wajib diisi.", "error");

  btn.disabled = true;
  try {
    await updateDoc(doc(db, "issues", issue.id), { status: to, editorNote: note.trim(), decidedAt: serverTimestamp(), decidedBy: user.uid });
    issues = issues.filter((i) => i.id !== issue.id);
    renderIssues();
    showToast(to === "accepted" ? "Usulan diterima." : "Usulan ditolak.", "success");
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    showToast("Gagal menyimpan keputusan.", "error");
  }
});

load();
loadIssues();