/* ==========================================================
   fb-jurnalis-pitch.js — usulan isu (pitch) dari jurnalis
   Koleksi "issues": jurnalis membuat (status "submitted"), editor memutuskan.
   ========================================================== */
import { db, collection, query, where, limit, getDocs, addDoc, serverTimestamp, Timestamp } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { escapeHtml, timeAgo, formatDate, showToast } from "./utils.js";

const { user, profile } = await requireRole(["journalist"]);

const $ = (id) => document.getElementById(id);
const listEl = $("pitch-list");
const form = $("pitch-form");
const errorEl = $("pitch-error");
const submitBtn = $("pitch-submit");

const STATUS = {
  submitted: ["Diajukan", "status--submitted"],
  accepted: ["Diterima", "status--approved"],
  rejected: ["Ditolak", "status--rejected"],
};

let pitches = [];
const ms = (p) => p.createdAt?.toMillis?.() ?? (p.createdAt instanceof Date ? p.createdAt.getTime() : Date.now());

function itemHtml(p) {
  const [label, cls] = STATUS[p.status] || [p.status, ""];
  const note = p.editorNote ? `<p class="work-item__note"><strong>Catatan editor:</strong> ${escapeHtml(p.editorNote)}</p>` : "";
  const next = p.status === "accepted" ? `<a class="btn btn--primary btn--sm" href="/jurnalis/tulis.html">Tulis artikelnya</a>` : "";
  return `<article class="work-item">
    <div>
      <h3 class="work-item__title">${escapeHtml(p.title)}</h3>
      <p style="margin-top:var(--space-2);font-size:var(--text-sm)">${escapeHtml(p.summary)}</p>
      <div class="work-item__meta">
        <span>Dikirim ${escapeHtml(timeAgo(p.createdAt) || "baru saja")}</span>
        ${p.deadline ? `<span>Target ${escapeHtml(formatDate(p.deadline))}</span>` : ""}
      </div>
      ${note}
    </div>
    <span class="status ${cls}">${escapeHtml(label)}</span>
    <div class="work-item__actions">${next}</div>
  </article>`;
}

function render() {
  listEl.innerHTML = pitches.length
    ? pitches.map(itemHtml).join("")
    : `<div class="empty"><p class="empty__title">Belum ada usulan</p><p>Kirim ide liputan pertamamu lewat form di samping.</p></div>`;
}

async function load() {
  try {
    const snap = await getDocs(query(collection(db, "issues"), where("authorId", "==", user.uid), limit(100)));
    pitches = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b) - ms(a));
    render();
  } catch (err) {
    console.error("[pitch]", err);
    const denied = err.code === "permission-denied";
    listEl.innerHTML = `<div class="alert alert--error">${denied ? "Tidak punya izin membaca usulan. Periksa Firestore Rules." : "Gagal memuat usulan."} <button class="link-btn" type="button" id="retry">Coba lagi</button></div>`;
    $("retry")?.addEventListener("click", load);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const title = $("p-title").value.trim();
  const summary = $("p-summary").value.trim();
  const reason = $("p-reason").value.trim();
  const deadlineValue = $("p-deadline").value;

  const problems = [];
  if (title.length < 10) problems.push("Judul minimal 10 karakter.");
  if (summary.length < 30) problems.push("Ringkasan minimal 30 karakter.");
  if (reason.length < 20) problems.push("Alasan minimal 20 karakter.");
  let deadline = null;
  if (deadlineValue) {
    deadline = new Date(`${deadlineValue}T23:59:59`);
    if (deadline.getTime() < Date.now()) problems.push("Target selesai tidak boleh di masa lalu.");
  }
  if (problems.length) {
    errorEl.textContent = problems.join(" ");
    errorEl.hidden = false;
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Mengirim...";
  try {
    const data = {
      title, summary, reason,
      deadline: deadline ? Timestamp.fromDate(deadline) : null,
      status: "submitted",
      editorNote: "",
      authorId: user.uid,
      authorName: profile.name || user.email,
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(db, "issues"), data);
    pitches.unshift({ id: ref.id, ...data, createdAt: new Date() });
    render();
    form.reset();
    showToast("Usulan terkirim ke redaksi.", "success");
  } catch (err) {
    console.error("[pitch kirim]", err);
    errorEl.textContent = err.code === "permission-denied" ? "Tidak punya izin mengirim. Periksa Firestore Rules." : "Gagal mengirim. Coba lagi.";
    errorEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Kirim usulan";
  }
});

load();
