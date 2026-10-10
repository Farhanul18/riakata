/* ==========================================================
   lib/firebase.js — bantuan bersama untuk Netlify Functions
   (folder lib/ bukan function, hanya dipakai oleh function lain)
   Variabel lingkungan: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
   Opsional: SITE_URL (alamat situs utama; kalau kosong dipakai URL dari Netlify)
   ========================================================== */
const admin = require("firebase-admin");

/** Inisialisasi sekali, lalu pakai ulang. Melempar Error("env-kosong") bila variabel belum diisi. */
function getAdmin() {
  if (!admin.apps.length) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) throw new Error("env-kosong");
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin;
}

/** Alamat dasar situs tanpa garis miring di akhir. */
function siteUrl(event) {
  const base = process.env.SITE_URL || process.env.URL || `https://${event.headers.host}`;
  return base.replace(/\/+$/, "");
}

/** Escape untuk HTML dan XML (teks maupun atribut). */
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

module.exports = { getAdmin, siteUrl, escapeHtml, json };
