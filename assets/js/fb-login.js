/* ==========================================================
   fb-login.js — logika halaman login
   Alur: login Firebase Auth -> baca users/{uid} -> arahkan sesuai role.
   ========================================================== */
import {
  auth, db, isConfigured, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, doc, getDoc,
} from "./firebase-config.js";
import { ROLE_HOME, getParam, safeNextPath } from "./utils.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const submitBtn = document.getElementById("login-submit");
const messageBox = document.getElementById("login-message");
const resetBtn = document.getElementById("reset-password");
const toggleBtn = document.getElementById("toggle-password");

let busy = false; // true selama proses login manual, supaya tidak bentrok dengan pemeriksaan sesi

function showMessage(text, type = "error") {
  messageBox.textContent = text;
  messageBox.className = `alert alert--${type}`;
  messageBox.hidden = !text;
}

function setBusy(state) {
  busy = state;
  submitBtn.disabled = state;
  submitBtn.textContent = state ? "Memproses..." : "Masuk";
}

/** Terjemahkan kode error Firebase ke bahasa yang dimengerti pengguna. */
function authMessage(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email atau kata sandi salah.";
    case "auth/invalid-email": return "Format email belum benar.";
    case "auth/user-disabled": return "Akun ini dinonaktifkan. Hubungi redaksi.";
    case "auth/too-many-requests": return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
    case "auth/network-request-failed": return "Koneksi bermasalah. Periksa internet kamu.";
    default: return "Gagal masuk. Coba lagi sebentar.";
  }
}

/** Baca profil, pastikan akun aktif dan punya peran, lalu pindah halaman. */
async function routeUser(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  const profile = snap.exists() ? snap.data() : null;

  if (!profile || profile.isActive === false || !ROLE_HOME[profile.role]) {
    await signOut(auth);
    const err = new Error("no-access");
    err.code = "app/no-access";
    throw err;
  }
  location.replace(safeNextPath(getParam("next"), profile.role) || ROLE_HOME[profile.role]);
}

/* ---------- Kirim form ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("");
  const email = emailInput.value.trim();
  const password = passInput.value;

  emailInput.setAttribute("aria-invalid", String(!email));
  passInput.setAttribute("aria-invalid", String(!password));
  if (!email || !password) {
    showMessage("Email dan kata sandi wajib diisi.");
    (email ? passInput : emailInput).focus();
    return;
  }

  setBusy(true);
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await routeUser(user);
  } catch (err) {
    if (err.code === "app/no-access") {
      showMessage("Akun kamu belum terdaftar sebagai jurnalis atau redaktur, atau sedang dinonaktifkan. Hubungi redaksi.");
    } else if (err.code === "permission-denied" || err.code === "unavailable") {
      showMessage("Profil akun tidak bisa dibaca. Periksa Firestore Rules dan koneksi.");
    } else {
      showMessage(authMessage(err.code));
    }
    setBusy(false);
  }
});

/* ---------- Lupa kata sandi ---------- */
resetBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showMessage("Isi kolom email dulu dengan format yang benar, lalu klik \"Lupa kata sandi\".");
    emailInput.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    if (err.code === "auth/network-request-failed") return showMessage(authMessage(err.code));
    // Kode lain sengaja diabaikan agar tidak membocorkan apakah email terdaftar
  }
  showMessage("Jika email itu terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim.", "success");
});

/* ---------- Tampilkan / sembunyikan kata sandi ---------- */
toggleBtn.addEventListener("click", () => {
  const show = passInput.type === "password";
  passInput.type = show ? "text" : "password";
  toggleBtn.textContent = show ? "Sembunyikan" : "Tampilkan";
  toggleBtn.setAttribute("aria-pressed", String(show));
});

/* ---------- Sudah login sebelumnya? Langsung arahkan ---------- */
if (!isConfigured) {
  showMessage("Firebase belum dikonfigurasi. Isi data di assets/js/firebase-config.js.", "info");
  submitBtn.disabled = true;
} else {
  onAuthStateChanged(auth, (user) => {
    if (user && !busy) routeUser(user).catch(() => { /* akun tanpa profil sudah di-logout, form tetap tampil */ });
  });
}
