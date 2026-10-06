/* ==========================================================
   auth-guard.js — penjaga halaman jurnalis & redaksi
   Cara pakai di halaman yang wajib login:
     1) <html lang="id" class="auth-pending"> dan di <head>:
        <style>html.auth-pending body{visibility:hidden}</style>
     2) <script type="module">
          import { requireRole } from "/assets/js/auth-guard.js";
          const { user, profile } = await requireRole(["editor"]);
        </script>
   PENTING: ini cuma pengaman tampilan. Pengaman sebenarnya = firestore.rules.
   ========================================================== */
import { auth, db, onAuthStateChanged, signOut, doc, getDoc } from "./firebase-config.js";
import { ROLE_HOME, ROLE_LABEL } from "./utils.js";

function goLogin() {
  const next = encodeURIComponent(location.pathname + location.search);
  location.replace(`/login.html?next=${next}`);
}

/** Isi elemen [data-user-name], [data-user-role] dan pasang tombol [data-logout]. */
function bindUserUi(profile) {
  document.querySelectorAll("[data-user-name]").forEach((el) => { el.textContent = profile.name || profile.email; });
  document.querySelectorAll("[data-user-role]").forEach((el) => { el.textContent = ROLE_LABEL[profile.role] || ""; });
  document.querySelectorAll("[data-logout]").forEach((el) => {
    el.addEventListener("click", async () => {
      await signOut(auth);
      location.replace("/login.html");
    });
  });
}

/**
 * Pastikan pengunjung sudah login, akunnya aktif, dan perannya cocok.
 * Kalau tidak, diarahkan ke halaman yang sesuai. Mengembalikan { user, profile }.
 */
export function requireRole(allowedRoles) {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, async (user) => {
      stop();
      if (!user) return goLogin();

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const profile = snap.exists() ? { uid: user.uid, ...snap.data() } : null;

        if (!profile || profile.isActive === false || !ROLE_HOME[profile.role]) {
          await signOut(auth);
          return goLogin();
        }
        // Peran salah: kirim ke area miliknya sendiri
        if (!allowedRoles.includes(profile.role)) return location.replace(ROLE_HOME[profile.role]);

        bindUserUi(profile);
        document.documentElement.classList.remove("auth-pending");
        // Kalau logout dari tab lain, halaman ini ikut menendang
        onAuthStateChanged(auth, (u) => { if (!u) goLogin(); });
        resolve({ user, profile });
      } catch (err) {
        console.error("[auth-guard]", err);
        document.documentElement.classList.remove("auth-pending");
        document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">Gagal memeriksa akses. Periksa koneksi lalu <a href="">muat ulang halaman</a>.</p>';
      }
    });
  });
}
