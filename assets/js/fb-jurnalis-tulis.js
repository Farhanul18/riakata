/* ==========================================================
   fb-jurnalis-tulis.js — tulis / edit artikel (jurnalis)
   Alur: isi form -> "Simpan draft" (status draft) atau
         "Kirim ke redaksi" (status submitted + catatan di articles/{id}/revisions).
   Mode edit dibuka lewat ?id=<ID artikel>.
   ========================================================== */
import {
  db, doc, getDoc, getDocs, collection, query, orderBy, writeBatch, serverTimestamp,
} from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { uploadImage, FOLDERS } from "./cloudinary.js";
import {
  slugify, readingTime, getParam, cloudinaryUrl, escapeHtml,
  DEFAULT_CATEGORIES, STATUS_LABEL, statusClass, showToast,
} from "./utils.js";

const { user, profile } = await requireRole(["journalist"]);

const $ = (id) => document.getElementById(id);
const el = {
  form: $("article-form"), title: $("title"), category: $("category"), tags: $("tags"), excerpt: $("excerpt"),
  coverPicker: $("cover-picker"), coverFile: $("cover-file"), coverImg: $("cover-preview"),
  coverProgress: $("cover-progress"), coverBar: $("cover-progress-bar"), coverRemove: $("cover-remove"),
  coverUrl: $("cover-url"), coverAlt: $("cover-alt"), coverCredit: $("cover-credit"),
  errors: $("form-errors"), notice: $("editor-notice"), badge: $("status-badge"), words: $("word-info"),
  saveDraft: $("save-draft"), submit: $("submit-article"), pageTitle: $("page-title"),
};

const EDITABLE = ["draft", "needs_revision"];
const MIN_WORDS = 50;

let articleId = getParam("id"); // null = artikel baru
let current = null; // data artikel yang sedang dibuka
let busy = false; // sedang menyimpan
let uploading = false; // sedang upload gambar
let dirty = false; // ada perubahan belum disimpan

/* ---------- Editor teks (Quill) ---------- */
if (typeof Quill === "undefined") {
  el.notice.hidden = false;
  el.notice.className = "alert alert--error";
  el.notice.textContent = "Editor teks gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.";
  throw new Error("Quill tidak tersedia");
}

const quill = new Quill("#editor", {
  theme: "snow",
  placeholder: "Mulai menulis ceritamu di sini...",
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
});

/** Sisipkan gambar di tengah artikel: upload ke Cloudinary, lalu minta deskripsi (alt). */
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
const wordCount = () => (quill.getText().trim().split(/\s+/).filter(Boolean).length);

function updateWordInfo() {
  const n = wordCount();
  el.words.textContent = `${n} kata · sekitar ${Math.max(1, Math.ceil(n / 200))} menit baca`;
}

/* ---------- Bantu tampilan ---------- */
function showNotice(text, type = "info") {
  el.notice.hidden = !text;
  el.notice.className = `alert alert--${type}`;
  el.notice.textContent = text;
}

function setStatusBadge(status) {
  el.badge.className = status ? statusClass(status) : "status";
  el.badge.textContent = status ? STATUS_LABEL[status] || status : "Belum disimpan";
}

function refreshButtons() {
  const locked = busy || uploading;
  el.saveDraft.disabled = locked;
  el.submit.disabled = locked;
  el.saveDraft.textContent = busy ? "Menyimpan..." : "Simpan draft";
}
function setUploading(state) { uploading = state; refreshButtons(); }

function bindCounter(input, counterId, max) {
  const counter = $(counterId);
  const update = () => { counter.textContent = `${input.value.length}/${max}`; };
  input.addEventListener("input", update);
  update();
  return update;
}
const updateTitleCounter = bindCounter(el.title, "title-counter", 120);
const updateExcerptCounter = bindCounter(el.excerpt, "excerpt-counter", 200);

/* ---------- Kategori ---------- */
async function loadCategories() {
  let list = [];
  try {
    const snap = await getDocs(query(collection(db, "categories"), orderBy("order")));
    list = snap.docs.map((d) => ({ slug: d.data().slug || d.id, name: d.data().name }));
  } catch (err) {
    console.warn("[kategori] memakai daftar bawaan:", err.code || err);
  }
  if (!list.length) list = DEFAULT_CATEGORIES;
  el.category.innerHTML = '<option value="">Pilih kategori...</option>' +
    list.map((c) => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join("");
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

el.coverFile.addEventListener("change", async () => {
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
    const img = await uploadImage(file, {
      folder: FOLDERS.covers,
      onProgress: (p) => { el.coverBar.style.width = `${p}%`; },
    });
    el.coverUrl.value = img.url;
    showCover(img.url);
    dirty = true;
    showToast("Foto sampul terunggah.", "success");
  } catch (err) {
    showCover(previousUrl); // kembalikan ke gambar sebelumnya
    showToast(err.message, "error");
  } finally {
    URL.revokeObjectURL(localUrl);
    el.coverProgress.hidden = true;
    setUploading(false);
  }
});

el.coverRemove.addEventListener("click", () => {
  el.coverUrl.value = "";
  showCover("");
  dirty = true;
});
el.coverAlt.addEventListener("input", () => { el.coverImg.alt = el.coverAlt.value; });

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

/** Kembalikan daftar masalah { field, msg }. Draft hanya butuh judul. */
function findProblems(d, forSubmit) {
  const p = [];
  if (!d.title) p.push({ field: el.title, msg: "Judul wajib diisi." });
  if (!forSubmit) return p;

  if (d.title && d.title.length < 10) p.push({ field: el.title, msg: "Judul minimal 10 karakter." });
  if (!d.category) p.push({ field: el.category, msg: "Pilih kategori." });
  if (d.excerpt.length < 30) p.push({ field: el.excerpt, msg: "Ringkasan minimal 30 karakter." });
  if (!d.coverUrl) p.push({ field: el.coverFile, msg: "Unggah foto sampul." });
  if (d.coverUrl && !d.coverAlt) p.push({ field: el.coverAlt, msg: "Deskripsi gambar (alt text) wajib diisi." });
  if (d.coverUrl && !d.coverCredit) p.push({ field: el.coverCredit, msg: "Kredit foto wajib diisi." });
  if (wordCount() < MIN_WORDS) p.push({ field: "editor", msg: `Isi artikel minimal ${MIN_WORDS} kata (sekarang ${wordCount()}).` });
  return p;
}

function showProblems(list) {
  el.errors.hidden = !list.length;
  if (!list.length) return;
  el.errors.innerHTML = `<strong>Periksa lagi:</strong><ul>${list.map((p) => `<li>${escapeHtml(p.msg)}</li>`).join("")}</ul>`;
  const first = list[0].field;
  if (first === "editor") quill.focus(); else first.focus();
  el.errors.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------- Simpan ---------- */
const makeSlug = (title, id) => `${slugify(title).slice(0, 70) || "artikel"}-${id.slice(0, 5).toLowerCase()}`;

async function save(wantSubmit) {
  if (busy || uploading) return;
  if (current && !EDITABLE.includes(current.status)) return;

  const data = collect();
  const problems = findProblems(data, wantSubmit);
  showProblems(problems);
  if (problems.length) return;

  if (wantSubmit && !confirm("Kirim artikel ke redaksi? Kamu tidak bisa mengedit lagi sampai editor mengembalikannya.")) return;

  busy = true;
  refreshButtons();
  try {
    const isNew = !articleId;
    const id = articleId || doc(collection(db, "articles")).id;
    const ref = doc(db, "articles", id);
    const fromStatus = current?.status || "draft";
    // Menyimpan draft pada artikel "perlu revisi" tidak mengubah statusnya
    const status = wantSubmit ? "submitted" : fromStatus === "needs_revision" ? "needs_revision" : "draft";
    const now = serverTimestamp();

    const fields = { ...data, readingTime: readingTime(data.content), status, updatedAt: now };
    const batch = writeBatch(db);

    if (isNew) {
      batch.set(ref, {
        ...fields,
        slug: makeSlug(data.title, id),
        authorId: user.uid,
        authorName: profile.name || user.email,
        isHeadline: false,
        isEditorPick: false,
        views: 0,
        editorNote: "",
        createdAt: now,
        submittedAt: wantSubmit ? now : null,
        publishedAt: null,
      });
    } else {
      const update = { ...fields };
      if (wantSubmit) { update.submittedAt = now; update.editorNote = ""; }
      batch.update(ref, update);
    }

    if (wantSubmit) {
      batch.set(doc(collection(db, "articles", id, "revisions")), {
        fromStatus, toStatus: "submitted", note: "",
        byUid: user.uid, byName: profile.name || user.email, createdAt: now,
      });
    }

    await batch.commit();

    articleId = id;
    current = { ...(current || {}), status };
    dirty = false;

    if (wantSubmit) {
      location.href = "/jurnalis/dashboard.html?notice=submitted";
      return;
    }
    if (isNew) history.replaceState(null, "", `?id=${id}`);
    setStatusBadge(status);
    showToast("Draft tersimpan.", "success");
  } catch (err) {
    console.error("[simpan artikel]", err);
    const denied = err.code === "permission-denied";
    showToast(denied ? "Tidak punya izin menyimpan. Periksa Firestore Rules." : "Gagal menyimpan. Periksa koneksi lalu coba lagi.", "error");
  } finally {
    busy = false;
    refreshButtons();
  }
}

/* ---------- Muat artikel yang diedit ---------- */
function fillForm(d) {
  el.title.value = d.title || "";
  el.category.value = d.category || "";
  el.tags.value = (d.tags || []).join(", ");
  el.excerpt.value = d.excerpt || "";
  el.coverUrl.value = d.coverUrl || "";
  el.coverAlt.value = d.coverAlt || "";
  el.coverCredit.value = d.coverCredit || "";
  quill.setContents(quill.clipboard.convert({ html: d.content || "" }), "silent");
  showCover(d.coverUrl || "");
  updateTitleCounter();
  updateExcerptCounter();
  updateWordInfo();
}

function lockForm(message) {
  el.form.querySelectorAll("input, select, textarea, button").forEach((x) => { x.disabled = true; });
  quill.disable();
  document.querySelector(".editor-actions__buttons").hidden = true;
  showNotice(message, "info");
}

function fatal(message) {
  el.form.hidden = true;
  showNotice(message, "error");
}

async function loadArticle() {
  el.pageTitle.textContent = "Edit Artikel";
  try {
    const snap = await getDoc(doc(db, "articles", articleId));
    if (!snap.exists() || snap.data().authorId !== user.uid) return fatal("Artikel tidak ditemukan.");
    current = snap.data();
  } catch (err) {
    console.error(err);
    return fatal("Artikel tidak bisa dibuka. Periksa koneksi atau Firestore Rules.");
  }

  fillForm(current);
  setStatusBadge(current.status);

  if (current.status === "needs_revision" && current.editorNote) {
    showNotice(`Catatan editor: ${current.editorNote}`, "info");
  }
  if (!EDITABLE.includes(current.status)) {
    lockForm(`Artikel ini berstatus "${STATUS_LABEL[current.status] || current.status}" dan tidak bisa diedit.`);
  }
}

/* ---------- Pemicu ---------- */
el.saveDraft.addEventListener("click", () => save(false));
el.submit.addEventListener("click", () => save(true));
el.form.addEventListener("submit", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(false); }
});

quill.on("text-change", (delta, old, source) => { updateWordInfo(); if (source === "user") dirty = true; });
el.form.addEventListener("input", () => { dirty = true; });
window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

await loadCategories();
if (articleId) await loadArticle(); else updateWordInfo();
dirty = false;
refreshButtons();