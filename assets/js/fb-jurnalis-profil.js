/* ==========================================================
   fb-jurnalis-profil.js — jurnalis mengedit bio dan foto profilnya sendiri
   Yang boleh diubah sendiri: bio dan foto. Nama dan jabatan diatur redaksi
   (dikunci juga di firestore.rules, bukan hanya di tampilan).
   Disimpan ke users/{uid} (privat) dan profiles/{uid} (publik, tanpa email).
   ========================================================== */
import { db, doc, writeBatch, serverTimestamp } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { uploadImage, FOLDERS } from "./cloudinary.js";
import { avatarHtml } from "./render.js";
import { href, showToast } from "./utils.js";

const { user, profile } = await requireRole(["journalist"]);

const $ = (id) => document.getElementById(id);
const bioEl = $("bio");
const saveBtn = $("profile-save");
const errorEl = $("profile-error");

let photoUrl = profile.photoUrl || "";
let uploading = false;
let dirty = false;

function renderAvatar() {
  $("avatar").innerHTML = avatarHtml({ name: profile.name, photoUrl }, "lg");
  $("photo-remove").hidden = !photoUrl;
}

$("p-name").textContent = profile.name || user.email;
$("p-position").textContent = profile.position || "Jurnalis";
bioEl.value = profile.bio || "";
$("public-link").href = href(`/penulis/${encodeURIComponent(user.uid)}`);
const updateCounter = () => { $("bio-counter").textContent = `${bioEl.value.length}/400`; };
bioEl.addEventListener("input", () => { updateCounter(); dirty = true; });
updateCounter();
renderAvatar();

/* ---------- Foto ---------- */
$("photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  uploading = true;
  saveBtn.disabled = true;
  $("photo-progress").hidden = false;
  $("photo-bar").style.width = "0%";
  $("photo-status").textContent = "Mengunggah foto...";
  try {
    const img = await uploadImage(file, { folder: FOLDERS.authors, onProgress: (p) => { $("photo-bar").style.width = `${p}%`; } });
    photoUrl = img.url;
    dirty = true;
    renderAvatar();
    $("photo-status").textContent = "Foto siap. Klik Simpan profil untuk menyimpan.";
  } catch (err) {
    $("photo-status").textContent = err.message;
  } finally {
    uploading = false;
    saveBtn.disabled = false;
    $("photo-progress").hidden = true;
  }
});

$("photo-remove").addEventListener("click", () => {
  photoUrl = "";
  dirty = true;
  renderAvatar();
  $("photo-status").textContent = "Foto dihapus. Klik Simpan profil untuk menyimpan.";
});

/* ---------- Simpan ---------- */
$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (uploading) return;
  errorEl.hidden = true;

  const bio = bioEl.value.trim();
  if (bio.length > 400) {
    errorEl.textContent = "Bio maksimal 400 karakter.";
    errorEl.hidden = false;
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Menyimpan...";
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "users", user.uid), { bio, photoUrl });
    // Salinan publik: nama, jabatan, dan peran diambil dari data akun (tidak bisa diubah di sini)
    batch.set(doc(db, "profiles", user.uid), {
      name: profile.name || "",
      position: profile.position || "",
      bio,
      photoUrl,
      role: profile.role,
      isActive: true,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await batch.commit();

    profile.bio = bio;
    profile.photoUrl = photoUrl;
    dirty = false;
    $("photo-status").textContent = "";
    showToast("Profil disimpan.", "success");
  } catch (err) {
    console.error("[profil]", err);
    errorEl.textContent = err.code === "permission-denied"
      ? "Tidak punya izin menyimpan. Pastikan firestore.rules terbaru sudah di-publish dan data akunmu lengkap (nama dan jabatan terisi)."
      : "Gagal menyimpan. Periksa koneksi lalu coba lagi.";
    errorEl.hidden = false;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Simpan profil";
  }
});

window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
