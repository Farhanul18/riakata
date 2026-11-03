/* ==========================================================
   fb-redaksi-review.js — review satu artikel (?id=...)
   Editor membaca, memberi catatan, lalu mengubah status.
   Setiap perubahan status dicatat di articles/{id}/revisions.
   ========================================================== */
import {
  db, doc, getDoc, getDocs, collection, query, where, orderBy, limit, writeBatch, serverTimestamp,
} from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import {
  escapeHtml, getParam, formatDate, timeAgo, slugify, cloudinaryUrl, sanitizeHtml,
  categoryName, STATUS_LABEL, statusClass, showToast,
} from "./utils.js";

const { user, profile } = await requireRole(["editor"]);

const articleId = getParam("id");
const previewEl = document.getElementById("preview");
const actionEl = document.getElementById("action-body");
const infoEl = document.getElementById("info");
const historyEl = document.getElementById("history");
const noticeEl = document.getElementById("review-notice");
const layoutEl = document.getElementById("review-layout");

/** Perpindahan status yang diizinkan untuk editor. */
const TRANSITIONS = {
  submitted: ["in_review", "needs_revision", "rejected", "approved", "published"],
  in_review: ["needs_revision", "rejected", "approved", "published"],
  approved: ["published", "needs_revision"],
  published: ["needs_revision", "archived"],
  archived: ["published"],
};
const BUTTONS = {
  in_review: { label: "Mulai review", cls: "btn--outline" },
  needs_revision: { label: "Minta revisi", cls: "btn--outline" },
  rejected: { label: "Tolak", cls: "btn--danger" },
  approved: { label: "Setujui", cls: "btn--outline" },
  published: { label: "Terbitkan", cls: "btn--primary" },
  archived: { label: "Arsipkan", cls: "btn--outline" },
};
const NEEDS_NOTE = ["needs_revision", "rejected"];
const CONFIRM = {
  rejected: "Tolak artikel ini? Jurnalis akan melihat catatanmu.",
  published: "Terbitkan artikel ini ke publik?",
  archived: "Turunkan artikel dari publik dan arsipkan?",
};
/** Label dan konfirmasi khusus untuk transisi tertentu (override BUTTONS/CONFIRM biasa). */
const SPECIAL_TRANSITION = {
  "published->needs_revision": {
    label: "Kembalikan untuk Revisi",
    confirm: "Menarik artikel ini dari situs untuk direvisi jurnalis? Artikel akan HILANG dari halaman publik sampai diterbitkan ulang.",
  },
};

let article = null;
let busy = false;

function fatal(message) {
  layoutEl.hidden = true;
  noticeEl.hidden = false;
  noticeEl.className = "alert alert--error";
  noticeEl.textContent = message;
}

/* ---------- Tampilan ---------- */
function renderPreview() {
  const a = article;
  const cover = a.coverUrl
    ? `<figure class="preview__cover"><img src="${escapeHtml(cloudinaryUrl(a.coverUrl, "f_auto,q_auto,w_1200"))}" alt="${escapeHtml(a.coverAlt || "")}">${a.coverCredit ? `<figcaption>${escapeHtml(a.coverCredit)}</figcaption>` : ""}</figure>`
    : `<div class="alert alert--info" style="margin-bottom:var(--space-5)">Artikel ini belum punya foto sampul.</div>`;

  previewEl.innerHTML = `
    ${cover}
    <span class="badge badge--${escapeHtml(a.category)}">${escapeHtml(categoryName(a.category))}</span>
    <h2 class="preview__title">${escapeHtml(a.title || "(Tanpa judul)")}</h2>
    <p class="preview__excerpt">${escapeHtml(a.excerpt || "")}</p>
    <div class="prose">${sanitizeHtml(a.content || "<p><em>Isi artikel kosong.</em></p>")}</div>`;
}

function renderInfo() {
  const a = article;
  const rows = [
    ["Penulis", a.authorName || "-"],
    ["Kategori", categoryName(a.category)],
    ["Tag", (a.tags || []).map((t) => `#${t}`).join(" ") || "-"],
    ["Waktu baca", `${a.readingTime || 1} menit`],
    ["Dikirim", formatDate(a.submittedAt) || "-"],
    ["Diperbarui", timeAgo(a.updatedAt) || "-"],
    ["Terbit", formatDate(a.publishedAt) || "-"],
    ["Dibaca", String(a.views || 0)],
  ];
  infoEl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("");
}

function renderActions() {
  const a = article;
  const next = TRANSITIONS[a.status] || [];
  let html = `<p>Status: <span class="${statusClass(a.status)}">${escapeHtml(STATUS_LABEL[a.status] || a.status)}</span></p>`;
  html += `<p style="margin-top:var(--space-3)"><a class="btn btn--outline btn--sm" href="/redaksi/edit.html?id=${a.id}">Edit Artikel (isi lengkap)</a></p>`;

  if (a.status === "published") {
    html += `<p><a class="link-more" href="/artikel.html?slug=${encodeURIComponent(a.slug)}" target="_blank" rel="noopener">Lihat di situs</a></p>`;
  }
  if (!next.length) {
    const msg = a.status === "draft"
      ? "Artikel ini masih draft jurnalis."
      : a.status === "needs_revision"
        ? "Menunggu jurnalis memperbaiki artikel."
        : "Tidak ada tindakan untuk status ini.";
    actionEl.innerHTML = html + `<p class="text-muted" style="font-size:var(--text-sm)">${msg}</p>`;
    return;
  }

  html += `
    <div class="field" style="margin-top:var(--space-4)">
      <label class="field__label" for="note">Catatan untuk jurnalis</label>
      <textarea class="textarea" id="note" rows="4" maxlength="1000" placeholder="Wajib diisi untuk revisi atau penolakan."></textarea>
    </div>`;
  if (next.includes("published")) {
    html += `
      <div class="field" style="margin-top:var(--space-4)">
        <label class="field__label" for="slug">Alamat artikel (slug)</label>
        <input class="input" id="slug" type="text" value="${escapeHtml(a.slug || "")}" autocomplete="off">
        <span class="field__hint">Dicek unik saat menerbitkan.</span>
      </div>`;
  }
  html += `<div class="action-buttons" style="margin-top:var(--space-4)">${next.map((to) => {
    const b = BUTTONS[to];
    const special = SPECIAL_TRANSITION[`${a.status}->${to}`];
    const label = special?.label || (a.status === "archived" && to === "published" ? "Terbitkan lagi" : b.label);
    return `<button class="btn ${b.cls}" type="button" data-to="${to}">${label}</button>`;
  }).join("")}</div>`;
  actionEl.innerHTML = html;
}

/* ---------- Permintaan revisi dari jurnalis (field articles.revisionRequest) ---------- */
function renderRevisionRequest() {
  const box = document.getElementById("revreq-box");
  const r = article.revisionRequest;
  if (!r) { box.hidden = true; return; }

  box.hidden = false;
  const statusLabel = { pending: "Menunggu keputusan", approved: "Disetujui", declined: "Ditolak" }[r.status] || r.status;
  let html = `
    <p><strong>${escapeHtml(article.authorName || "Jurnalis")}</strong> meminta artikel ini direvisi (${escapeHtml(statusLabel)}).</p>
    <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--space-2)">${escapeHtml(r.reason || "")}</p>`;
  if (r.status === "pending" && article.status === "published") {
    html += `<div class="action-buttons" style="margin-top:var(--space-3)">
      <button class="btn btn--primary btn--sm" type="button" id="revreq-approve">Setujui &amp; tarik untuk revisi</button>
      <button class="btn btn--outline btn--sm" type="button" id="revreq-decline">Tolak permintaan</button>
    </div>`;
  }
  box.innerHTML = html;

  document.getElementById("revreq-approve")?.addEventListener("click", () => decideRevisionRequest(true));
  document.getElementById("revreq-decline")?.addEventListener("click", () => decideRevisionRequest(false));
}

async function decideRevisionRequest(approve) {
  if (busy) return;
  if (approve && !confirm(SPECIAL_TRANSITION["published->needs_revision"].confirm)) return;

  busy = true;
  try {
    const now = serverTimestamp();
    const batch = writeBatch(db);
    if (approve) {
      batch.update(doc(db, "articles", articleId), {
        status: "needs_revision",
        editorNote: article.revisionRequest.reason || "",
        "revisionRequest.status": "approved",
        "revisionRequest.decidedAt": now,
        "revisionRequest.decidedBy": user.uid,
        updatedAt: now,
      });
      batch.set(doc(collection(db, "articles", articleId, "revisions")), {
        fromStatus: "published", toStatus: "needs_revision", note: article.revisionRequest.reason || "",
        byUid: user.uid, byName: profile.name || user.email, createdAt: now,
      });
    } else {
      batch.update(doc(db, "articles", articleId), {
        "revisionRequest.status": "declined",
        "revisionRequest.decidedAt": now,
        "revisionRequest.decidedBy": user.uid,
      });
    }
    await batch.commit();
    showToast(approve ? "Artikel ditarik untuk revisi." : "Permintaan ditolak.", "success");
    await load();
  } catch (err) {
    console.error("[permintaan revisi]", err);
    showToast(err.code === "permission-denied" ? "Tidak punya izin. Periksa Firestore Rules." : "Gagal menyimpan keputusan.", "error");
  } finally {
    busy = false;
  }
}

async function renderHistory() {
  try {
    const snap = await getDocs(query(collection(db, "articles", articleId, "revisions"), orderBy("createdAt", "desc"), limit(30)));
    if (snap.empty) { historyEl.innerHTML = '<li class="text-muted">Belum ada riwayat.</li>'; return; }
    historyEl.innerHTML = snap.docs.map((d) => {
      const r = d.data();
      return `<li>
        <strong>${escapeHtml(r.byName || "-")}</strong>: ${escapeHtml(STATUS_LABEL[r.fromStatus] || r.fromStatus)} → ${escapeHtml(STATUS_LABEL[r.toStatus] || r.toStatus)}
        <div class="text-muted" style="font-size:var(--text-xs)">${escapeHtml(timeAgo(r.createdAt) || "baru saja")}</div>
        ${r.note ? `<div class="history__note">${escapeHtml(r.note)}</div>` : ""}
      </li>`;
    }).join("");
  } catch (err) {
    console.error("[riwayat]", err);
    historyEl.innerHTML = '<li class="text-muted">Riwayat tidak bisa dimuat.</li>';
  }
}

/* ---------- Muat & ubah status ---------- */
async function load() {
  try {
    const snap = await getDoc(doc(db, "articles", articleId));
    if (!snap.exists()) return fatal("Artikel tidak ditemukan.");
    article = { id: snap.id, ...snap.data() };
  } catch (err) {
    console.error(err);
    return fatal("Artikel tidak bisa dibuka. Periksa koneksi, Firestore Rules, dan role akun.");
  }
  document.title = `Review: ${article.title || "Artikel"} — Riakata`;
  renderPreview();
  renderInfo();
  renderActions();
  renderRevisionRequest();
  renderHistory();
}

async function changeStatus(to) {
  if (busy) return;
  const noteEl = document.getElementById("note");
  const slugEl = document.getElementById("slug");
  const note = noteEl ? noteEl.value.trim() : "";

  if (NEEDS_NOTE.includes(to) && !note) {
    showToast("Tulis catatan untuk jurnalis dulu.", "error");
    noteEl?.focus();
    return;
  }
  if (CONFIRM[to] && !confirm(CONFIRM[to])) return;

  busy = true;
  actionEl.querySelectorAll("button").forEach((b) => { b.disabled = true; });
  try {
    const update = {
      status: to,
      updatedAt: serverTimestamp(),
      editorNote: NEEDS_NOTE.includes(to) ? note : "",
    };

    if (to === "published") {
      const slug = slugify(slugEl ? slugEl.value : article.slug);
      if (!slug) { showToast("Slug tidak boleh kosong.", "error"); slugEl?.focus(); throw new Error("slug-kosong"); }
      const dup = await getDocs(query(collection(db, "articles"), where("slug", "==", slug), limit(2)));
      if (dup.docs.some((d) => d.id !== articleId)) { showToast("Slug itu sudah dipakai artikel lain. Ubah dulu.", "error"); slugEl?.focus(); throw new Error("slug-dobel"); }
      update.slug = slug;
      update.publishedAt = article.publishedAt || serverTimestamp();
    }
    if (to === "archived") update.isHeadline = false;

    const batch = writeBatch(db);
    batch.update(doc(db, "articles", articleId), update);
    batch.set(doc(collection(db, "articles", articleId, "revisions")), {
      fromStatus: article.status, toStatus: to, note,
      byUid: user.uid, byName: profile.name || user.email, createdAt: serverTimestamp(),
    });
    await batch.commit();

    showToast(`Status diubah: ${STATUS_LABEL[to]}.`, "success");
    await load();
  } catch (err) {
    if (!String(err.message).startsWith("slug-")) {
      console.error("[ubah status]", err);
      showToast(err.code === "permission-denied" ? "Tidak punya izin. Periksa Firestore Rules." : "Gagal mengubah status. Coba lagi.", "error");
    }
    actionEl.querySelectorAll("button").forEach((b) => { b.disabled = false; });
  } finally {
    busy = false;
  }
}

actionEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-to]");
  if (btn) changeStatus(btn.dataset.to);
});

if (!articleId) fatal("Alamat tidak lengkap. Buka artikel dari daftar.");
else load();