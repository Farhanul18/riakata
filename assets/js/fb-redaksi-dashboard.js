/* ==========================================================
   fb-redaksi-dashboard.js — ringkasan untuk redaktur
   Memuat artikel sekali (maks 300), lalu menghitung dan memilah di browser.
   ========================================================== */
import { db, collection, query, limit, getDocs } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { escapeHtml, timeAgo, STATUS_LABEL, statusClass, categoryName } from "./utils.js";

await requireRole(["editor"]);

const statsEl = document.getElementById("stats");
const queueEl = document.getElementById("queue-list");
const approvedEl = document.getElementById("approved-list");
const publishedEl = document.getElementById("published-list");

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

load();
