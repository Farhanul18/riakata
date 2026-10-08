/* ==========================================================
   fb-redaksi-subscriber.js — daftar pelanggan newsletter (editor)
   ========================================================== */
import { db, doc, collection, getDocs, deleteDoc, query, orderBy, limit } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { escapeHtml, formatDate, showToast } from "./utils.js";

await requireRole(["editor"]);

const $ = (id) => document.getElementById(id);
const listEl = $("sub-list");
const countEl = $("sub-count");
const searchEl = $("search");

let subs = [];

const visible = () => {
  const q = searchEl.value.trim().toLowerCase();
  return subs.filter((s) => !q || s.email.toLowerCase().includes(q));
};

function render() {
  const rows = visible();
  countEl.textContent = `${subs.length} pelanggan`;
  listEl.innerHTML = rows.length
    ? rows.map((s) => `<article class="work-item">
        <div><h3 class="work-item__title" style="font-weight:600">${escapeHtml(s.email)}</h3></div>
        <span class="text-muted" style="font-size:var(--text-sm)">${escapeHtml(formatDate(s.createdAt))}</span>
        <div class="work-item__actions"><button class="btn btn--ghost btn--sm" type="button" data-email="${escapeHtml(s.email)}">Hapus</button></div>
      </article>`).join("")
    : `<div class="empty"><p class="empty__title">${subs.length ? "Tidak ada yang cocok" : "Belum ada pelanggan"}</p></div>`;
}

async function load() {
  try {
    const snap = await getDocs(query(collection(db, "subscribers"), orderBy("createdAt", "desc"), limit(1000)));
    subs = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.email);
    render();
  } catch (err) {
    console.error("[subscriber]", err);
    countEl.textContent = "";
    listEl.innerHTML = `<div class="alert alert--error">${err.code === "permission-denied" ? "Tidak punya izin. Periksa Firestore Rules." : "Gagal memuat data."}</div>`;
  }
}

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-email]");
  if (!btn || !confirm(`Hapus ${btn.dataset.email} dari daftar?`)) return;
  btn.disabled = true;
  try {
    await deleteDoc(doc(db, "subscribers", btn.dataset.email));
    subs = subs.filter((s) => s.email !== btn.dataset.email);
    render();
    showToast("Pelanggan dihapus.", "success");
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    showToast("Gagal menghapus.", "error");
  }
});

$("copy-btn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(visible().map((s) => s.email).join(", "));
    showToast(`${visible().length} email disalin.`, "success");
  } catch {
    showToast("Gagal menyalin. Gunakan Unduh CSV.", "error");
  }
});

/** CSV aman: sel yang diawali = + - @ diberi tanda kutip agar tidak dibaca sebagai rumus Excel. */
const csvCell = (value) => {
  let v = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replaceAll('"', '""')}"`;
};

$("csv-btn").addEventListener("click", () => {
  const rows = [["email", "tanggal_daftar"], ...visible().map((s) => [s.email, formatDate(s.createdAt)])];
  const csv = "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "subscriber-riakata.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});

searchEl.addEventListener("input", render);
load();
