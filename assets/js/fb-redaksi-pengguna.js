/* ==========================================================
   fb-redaksi-pengguna.js — kelola pengguna (editor)
   - Daftar akun, edit profil, aktif/nonaktif
   - Tambah jurnalis lewat Netlify Function (butuh Admin SDK, tidak bisa dari browser)
   - Profil publik disalin ke koleksi "profiles" (tanpa email) untuk halaman penulis & tim redaksi
   ========================================================== */
import { auth, db, doc, collection, getDocs, query, limit, writeBatch, serverTimestamp } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { uploadImage, FOLDERS } from "./cloudinary.js";
import { avatarHtml } from "./render.js";
import { escapeHtml, showToast, ROLE_LABEL } from "./utils.js";

const { user: me } = await requireRole(["editor"]);

const $ = (id) => document.getElementById(id);
const listEl = $("user-list");
const createDialog = $("create-dialog");
const editDialog = $("edit-dialog");

let users = [];
let editing = null; // pengguna yang sedang diedit
let photoUrl = ""; // foto terbaru di dialog edit
let uploading = false;

/* ---------- Daftar ---------- */
function render() {
  listEl.innerHTML = users.map((u) => {
    const active = u.isActive !== false;
    const self = u.id === me.uid;
    return `<article class="work-item ${active ? "" : "is-inactive"}">
      <div class="person-row">
        ${avatarHtml(u, "sm")}
        <div style="min-width:0">
          <h3 class="work-item__title">${escapeHtml(u.name || "(Tanpa nama)")}${self ? " (kamu)" : ""}</h3>
          <div class="work-item__meta"><span>${escapeHtml(u.email || "")}</span><span>${escapeHtml(ROLE_LABEL[u.role] || u.role || "-")}</span>${u.position ? `<span>${escapeHtml(u.position)}</span>` : ""}</div>
        </div>
      </div>
      <span class="status ${active ? "status--published" : "status--rejected"}">${active ? "Aktif" : "Nonaktif"}</span>
      <div class="work-item__actions">
        <button class="btn btn--outline btn--sm" type="button" data-act="edit" data-id="${u.id}">Edit profil</button>
        ${self ? "" : `<button class="btn btn--ghost btn--sm" type="button" data-act="toggle" data-id="${u.id}">${active ? "Nonaktifkan" : "Aktifkan"}</button>`}
      </div>
    </article>`;
  }).join("") || `<div class="empty"><p class="empty__title">Belum ada pengguna</p></div>`;
}

async function load() {
  try {
    const snap = await getDocs(query(collection(db, "users"), limit(200)));
    users = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.role === b.role ? (a.name || "").localeCompare(b.name || "") : a.role === "editor" ? -1 : 1));
    render();
  } catch (err) {
    console.error("[pengguna]", err);
    listEl.innerHTML = `<div class="alert alert--error">${err.code === "permission-denied" ? "Tidak punya izin. Periksa Firestore Rules." : "Gagal memuat pengguna."}</div>`;
  }
}

/** Salinan publik tanpa email. */
const publicProfile = (u) => ({
  name: u.name || "", position: u.position || "", bio: u.bio || "", photoUrl: u.photoUrl || "",
  role: u.role, isActive: u.isActive !== false, updatedAt: serverTimestamp(),
});

/* ---------- Edit profil ---------- */
function openEdit(u) {
  editing = u;
  photoUrl = u.photoUrl || "";
  $("e-name").value = u.name || "";
  $("e-position").value = u.position || "";
  $("e-bio").value = u.bio || "";
  $("e-photo-status").textContent = "";
  $("e-avatar").innerHTML = avatarHtml({ ...u, photoUrl }, "lg");
  editDialog.showModal();
}

$("e-photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  uploading = true;
  $("e-submit").disabled = true;
  $("e-photo-status").textContent = "Mengunggah...";
  try {
    const img = await uploadImage(file, { folder: FOLDERS.authors, onProgress: (p) => { $("e-photo-status").textContent = `Mengunggah ${p}%`; } });
    photoUrl = img.url;
    $("e-avatar").innerHTML = avatarHtml({ name: $("e-name").value, photoUrl }, "lg");
    $("e-photo-status").textContent = "Foto siap disimpan.";
  } catch (err) {
    $("e-photo-status").textContent = err.message;
  } finally {
    uploading = false;
    $("e-submit").disabled = false;
  }
});

$("e-cancel").addEventListener("click", () => editDialog.close());
$("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (uploading) return;
  const name = $("e-name").value.trim();
  if (name.length < 2) return showToast("Nama minimal 2 karakter.", "error");

  const changes = { name, position: $("e-position").value.trim(), bio: $("e-bio").value.trim(), photoUrl };
  $("e-submit").disabled = true;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "users", editing.id), changes);
    batch.set(doc(db, "profiles", editing.id), publicProfile({ ...editing, ...changes }), { merge: true });
    await batch.commit();
    Object.assign(editing, changes);
    editDialog.close();
    render();
    showToast("Profil disimpan.", "success");
  } catch (err) {
    console.error(err);
    showToast(err.code === "permission-denied" ? "Tidak punya izin. Periksa Firestore Rules." : "Gagal menyimpan profil.", "error");
  } finally {
    $("e-submit").disabled = false;
  }
});

/* ---------- Aktif / nonaktif & sinkron ---------- */
async function toggleActive(u) {
  const next = u.isActive === false;
  if (!confirm(next ? `Aktifkan kembali ${u.name}?` : `Nonaktifkan ${u.name}? Dia tidak bisa masuk dan profilnya disembunyikan.`)) return;
  const batch = writeBatch(db);
  batch.update(doc(db, "users", u.id), { isActive: next });
  batch.set(doc(db, "profiles", u.id), publicProfile({ ...u, isActive: next }), { merge: true });
  await batch.commit();
  u.isActive = next;
  render();
  showToast(next ? "Akun diaktifkan." : "Akun dinonaktifkan.", "success");
}

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const u = users.find((x) => x.id === btn.dataset.id);
  if (!u) return;
  if (btn.dataset.act === "edit") return openEdit(u);
  btn.disabled = true;
  try { await toggleActive(u); }
  catch (err) { console.error(err); showToast("Gagal mengubah status akun.", "error"); }
  finally { btn.disabled = false; }
});

$("sync-btn").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    const batch = writeBatch(db);
    users.forEach((u) => batch.set(doc(db, "profiles", u.id), publicProfile(u), { merge: true }));
    await batch.commit();
    showToast(`${users.length} profil publik disinkronkan.`, "success");
  } catch (err) {
    console.error(err);
    showToast("Gagal menyinkronkan profil.", "error");
  } finally { e.target.disabled = false; }
});

/* ---------- Tambah jurnalis (Netlify Function) ---------- */
function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // tanpa karakter yang mirip
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

function resetCreateDialog() {
  $("create-form").hidden = false;
  $("create-done").hidden = true;
  $("create-form").reset();
  $("n-position").value = "Jurnalis";
  $("create-error").hidden = true;
}

$("add-btn").addEventListener("click", () => { resetCreateDialog(); $("n-password").value = generatePassword(); createDialog.showModal(); });
$("n-generate").addEventListener("click", () => { $("n-password").value = generatePassword(); });
$("n-cancel").addEventListener("click", () => createDialog.close());
$("done-close").addEventListener("click", () => createDialog.close());

$("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = $("create-error");
  errorEl.hidden = true;
  const payload = {
    name: $("n-name").value.trim(),
    email: $("n-email").value.trim(),
    position: $("n-position").value.trim(),
    password: $("n-password").value,
  };
  if (payload.name.length < 2) return showError("Nama minimal 2 karakter.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return showError("Format email belum benar.");
  if (payload.password.length < 8) return showError("Kata sandi minimal 8 karakter.");

  function showError(message) { errorEl.textContent = message; errorEl.hidden = false; }

  $("n-submit").disabled = true;
  $("n-submit").textContent = "Membuat...";
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/.netlify/functions/create-journalist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (res.status === 404) throw new Error("Fitur ini hanya berjalan di situs Netlify (atau dengan perintah `netlify dev`), tidak di Live Server.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Gagal membuat akun.");

    $("done-box").textContent = `Email: ${payload.email}\nKata sandi: ${payload.password}`;
    $("done-box").style.whiteSpace = "pre-line";
    $("create-form").hidden = true;
    $("create-done").hidden = false;
    await load();
  } catch (err) {
    showError(err.message);
  } finally {
    $("n-submit").disabled = false;
    $("n-submit").textContent = "Buat akun";
  }
});

load();
