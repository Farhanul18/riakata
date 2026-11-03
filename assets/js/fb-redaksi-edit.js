/* ==========================================================
   fb-redaksi-edit.js — redaksi mengedit langsung artikel apa pun
   (biasanya yang sudah terbit, untuk koreksi typo/salah data).
   Tidak mengubah status artikel maupun slug-nya.
   Catatan koreksi (opsional) dicatat di articles/{id}/revisions
   sebagai entri dengan fromStatus == toStatus (bukan perubahan status).
   ========================================================== */
import { db, doc, getDoc, collection, writeBatch, serverTimestamp } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { uploadImage, FOLDERS } from "./cloudinary.js";
import { fetchCategories } from "./articles.js";
import {
  slugify, readingTime, getParam, cloudinaryUrl, escapeHtml,
  STATUS_LABEL, statusClass, showToast,
} from "./utils.js";

const { user, profile } = await requireRole(["editor"]);

const $ = (id) => document.getElementById(id);
const el = {
  form: $("article-form"), title: $("title"), category: $("category"), tags: $("tags"), excerpt: $("excerpt"),
  coverPicker: $("cover-picker"), coverFile: $("cover-file"), coverImg: $("cover-preview"),
  coverProgress: $("cover-progress"), coverBar: $("cover-progress-bar"), coverRemove: $("cover-remove"),
  coverUrl: $("cover-url"), coverAlt: $("cover-alt"), coverCredit: $("cover-credit"),
  correctionNote: $("correction-note"),
  errors: $("form-errors"), notice: $("editor-notice"), badge: $("status-badge"),
  words: $("word-info"), saveBtn: $("save-btn"), saveStatus: $("save-status"),
};

const articleId = getParam("id");
let current = null;
let busy = false;
let uploading = false;
let dirty = false;

function fatal(message) {
  el.form.hidden = true;
  el.notice.hidden = false;
  el.notice.className = "alert alert--error";
  el.notice.textContent = message;
}

if (!articleId) fatal("Alamat tidak lengkap. Buka artikel dari daftar Semua Artikel.");

/* ---------- Editor teks (Quill) ---------- */
if (typeof Quill === "undefined" && articleId) {
  fatal("Editor teks gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.");
  throw new Error("Quill tidak tersedia");
}

const quill = articleId ? new Quill("#editor", {
  theme: "snow",
  placeholder: "Isi artikel...",
  modules: {
    toolbar: {
      container: [
        [{ header: [2, 3, false] }],
        ["bold", "italic", "underline"],
        ["blockquote"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image"],
        ["clean"],
      ],
      handlers: { image: insertImageIntoBody },
    },
  },
}) : null;

function insertImageIntoBody() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const range = quill.getSelection(true);
    setUploading(true);
    showToast("Mengunggah gambar...");
    try {
      const img = await uploadImage(file, { folder: FOLDERS.misc });
      const alt = window.prompt("Deskripsi gambar (untuk pembaca tunanetra):", "") || "";
      quill.insertEmbed(range.index, "image", cloudinaryUrl(img.url, "f_auto,q_auto,w_1200"), "user");
      quill.formatText(range.index, 1, { alt }, "user");
      quill.setSelection(range.index + 1);
      showToast("Gambar dimasukkan.", "success");
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setUploading(false);
    }
  });
  input.click();
}

const quillIsEmpty = () => quill.getText().trim().length === 0 && !quill.root.querySelector("img");
const wordCount = () => quill.getText().trim().split(/\s+/).filter(Boolean).length;
function updateWordInfo() {
  const n = wordCount();
  el.words.textContent = `${n} kata · sekitar ${Math.max(1, Math.ceil(n / 200))} menit baca`;
}

function refreshButtons() {
  const locked = busy || uploading;
  el.saveBtn.disabled = locked;
  el.saveBtn.textContent = busy ? "Menyimpan..." : "Simpan Perubahan";
}
function setUploading(state) { uploading = state; refreshButtons(); }

function bindCounter(input, counterId, max) {
  const counter = $(counterId);
  const update = () => { counter.textContent = `${input.value.length}/${max}`; };
  input.addEventListener("input", update);
  update();
}
bindCounter(el.title, "title-counter", 120);
bindCounter(el.excerpt, "excerpt-counter", 200);

/* ---------- Kategori ---------- */
async function loadCategories(selected) {
  const list = await fetchCategories();
  el.category.innerHTML = '<option value="">Pilih kategori...</option>' +
    list.map((c) => `<option value="${escapeHtml(c.slug)}"${c.slug === selected ? " selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
}

/* ---------- Foto sampul ---------- */
function showCover(url) {
  if (url) {
    el.coverImg.src = url.startsWith("blob:") ? url : cloudinaryUrl(url, "f_auto,q_auto,w_800");
    el.coverImg.alt = el.coverAlt.value;
    el.coverImg.hidden = false;
    el.coverPicker.classList.add("has-image");
    el.coverRemove.hidden = false;
  } else {
    el.coverImg.removeAttribute("src");
    el.coverImg.hidden = true;
    el.coverPicker.classList.remove("has-image");
    el.coverRemove.hidden = true;
  }
}

el.coverFile?.addEventListener("change", async () => {
  const file = el.coverFile.files[0];
  el.coverFile.value = "";
  if (!file) return;
  const previousUrl = el.coverUrl.value;
  const localUrl = URL.createObjectURL(file);
  showCover(localUrl);
  el.coverProgress.hidden = false;
  el.coverBar.style.width = "0%";
  setUploading(true);
  try {
    const img = await uploadImage(file, { folder: FOLDERS.covers, onProgress: (p) => { el.coverBar.style.width = `${p}%`; } });
    el.coverUrl.value = img.url;
    showCover(img.url);
    dirty = true;
    showToast("Foto sampul terunggah.", "success");
  } catch (err) {
    showCover(previousUrl);
    showToast(err.message, "error");
  } finally {
    URL.revokeObjectURL(localUrl);
    el.coverProgress.hidden = true;
    setUploading(false);
  }
});

el.coverRemove?.addEventListener("click", () => { el.coverUrl.value = ""; showCover(""); dirty = true; });
el.coverAlt?.addEventListener("input", () => { el.coverImg.alt = el.coverAlt.value; });

/* ---------- Ambil & validasi isi form ---------- */
function parseTags(text) {
  const tags = text.split(",").map((t) => slugify(t)).filter(Boolean);
  return [...new Set(tags)].slice(0, 8);
}

function collect() {
  return {
    title: el.title.value.trim(),
    category: el.category.value,
    tags: parseTags(el.tags.value),
    excerpt: el.excerpt.value.trim(),
    coverUrl: el.coverUrl.value,
    coverAlt: el.coverAlt.value.trim(),
    coverCredit: el.coverCredit.value.trim(),
    content: quillIsEmpty() ? "" : quill.getSemanticHTML(),
  };
}

function findProblems(d) {
  const p = [];
  if (!d.title || d.title.length < 5) p.push({ field: el.title, msg: "Judul minimal 5 karakter." });
  if (!d.category) p.push({ field: el.category, msg: "Pilih kategori." });
  if (d.coverUrl && !d.coverAlt) p.push({ field: el.coverAlt, msg: "Deskripsi gambar (alt text) wajib diisi kalau ada sampul." });
  return p;
}

function showProblems(list) {
  el.errors.hidden = !list.length;
  if (!list.length) return;
  el.errors.innerHTML = `<strong>Periksa lagi:</strong><ul>${list.map((p) => `<li>${escapeHtml(p.msg)}</li>`).join("")}</ul>`;
  list[0].field.focus();
  el.errors.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------- Simpan ---------- */
async function save() {
  if (busy || uploading || !current) return;
  const data = collect();
  const problems = findProblems(data);
  showProblems(problems);
  if (problems.length) return;

  busy = true;
  refreshButtons();
  try {
    const now = serverTimestamp();
    const note = el.correctionNote.value.trim();
    const batch = writeBatch(db);
    batch.update(doc(db, "articles", articleId), {
      ...data,
      readingTime: readingTime(data.content),
      lastEditedAt: now,
      lastEditedBy: user.uid,
      lastEditedByName: profile.name || user.email,
      correctionNote: note,
      updatedAt: now,
    });
    if (note) {
      batch.set(doc(collection(db, "articles", articleId, "revisions")), {
        fromStatus: current.status, toStatus: "edited", note,
        byUid: user.uid, byName: profile.name || user.email, createdAt: now,
      });
    }
    await batch.commit();

    dirty = false;
    el.saveStatus.textContent = "Tersimpan";
    el.correctionNote.value = "";
    showToast("Perubahan disimpan.", "success");
  } catch (err) {
    console.error("[edit artikel]", err);
    showToast(err.code === "permission-denied" ? "Tidak punya izin menyimpan. Periksa Firestore Rules." : "Gagal menyimpan. Periksa koneksi lalu coba lagi.", "error");
  } finally {
    busy = false;
    refreshButtons();
  }
}

/* ---------- Muat artikel ---------- */
function fillForm(d) {
  el.title.value = d.title || "";
  el.tags.value = (d.tags || []).join(", ");
  el.excerpt.value = d.excerpt || "";
  el.coverUrl.value = d.coverUrl || "";
  el.coverAlt.value = d.coverAlt || "";
  el.coverCredit.value = d.coverCredit || "";
  quill.setContents(quill.clipboard.convert({ html: d.content || "" }), "silent");
  showCover(d.coverUrl || "");
  el.title.dispatchEvent(new Event("input"));
  el.excerpt.dispatchEvent(new Event("input"));
  updateWordInfo();
}

async function load() {
  try {
    const snap = await getDoc(doc(db, "articles", articleId));
    if (!snap.exists()) return fatal("Artikel tidak ditemukan.");
    current = snap.data();
  } catch (err) {
    console.error(err);
    return fatal("Artikel tidak bisa dibuka. Periksa koneksi atau Firestore Rules.");
  }
  document.title = `Edit: ${current.title || "Artikel"} — Riakata`;
  el.badge.className = statusClass(current.status);
  el.badge.textContent = STATUS_LABEL[current.status] || current.status;
  await loadCategories(current.category);
  fillForm(current);
  dirty = false;
  refreshButtons();
}

el.saveBtn?.addEventListener("click", save);
el.form.addEventListener("submit", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
});
if (quill) quill.on("text-change", (d, o, source) => { updateWordInfo(); if (source === "user") { dirty = true; el.saveStatus.textContent = "Perubahan belum disimpan"; } });
el.form.addEventListener("input", () => { dirty = true; el.saveStatus.textContent = "Perubahan belum disimpan"; });
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

if (articleId) load();
