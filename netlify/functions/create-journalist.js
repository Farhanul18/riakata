/* ==========================================================
   create-journalist.js — editor membuat akun jurnalis baru
   Berjalan di server Netlify memakai Firebase Admin SDK.
   Alur: verifikasi ID token pemanggil -> pastikan dia editor aktif
         -> buat akun Auth -> tulis users/{uid} dan profiles/{uid}.
   Variabel lingkungan (Netlify): FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
   ========================================================== */
const admin = require("firebase-admin");

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function initAdmin() {
  if (admin.apps.length) return;
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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Metode tidak diizinkan." });

  try {
    initAdmin();
  } catch (err) {
    console.error("[create-journalist] init gagal:", err.message);
    return json(500, { error: "Server belum dikonfigurasi. Isi Environment Variables Firebase di Netlify." });
  }

  // 1) Siapa yang memanggil?
  const header = event.headers.authorization || event.headers.Authorization || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Belum login." });

  let caller;
  try {
    caller = await admin.auth().verifyIdToken(token);
  } catch {
    return json(401, { error: "Sesi tidak valid. Silakan login ulang." });
  }

  // 2) Harus editor yang aktif (dicek ke database, bukan percaya kiriman browser)
  const db = admin.firestore();
  const callerDoc = await db.doc(`users/${caller.uid}`).get();
  if (!callerDoc.exists || callerDoc.data().role !== "editor" || callerDoc.data().isActive !== true) {
    return json(403, { error: "Hanya redaktur aktif yang boleh membuat akun." });
  }

  // 3) Validasi masukan
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Data tidak valid." }); }
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const position = String(body.position || "Jurnalis").trim().slice(0, 80);

  if (name.length < 2 || name.length > 80) return json(400, { error: "Nama harus 2 sampai 80 karakter." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Format email belum benar." });
  if (password.length < 8 || password.length > 64) return json(400, { error: "Kata sandi harus 8 sampai 64 karakter." });

  // 4) Buat akun (peran selalu jurnalis; akun redaktur dibuat manual lewat Firebase Console)
  let user;
  try {
    user = await admin.auth().createUser({ email, password, displayName: name });
  } catch (err) {
    if (err.code === "auth/email-already-exists") return json(409, { error: "Email itu sudah terdaftar." });
    if (err.code === "auth/invalid-password") return json(400, { error: "Kata sandi tidak memenuhi syarat." });
    console.error("[create-journalist] createUser:", err.code || err.message);
    return json(500, { error: "Gagal membuat akun. Coba lagi." });
  }

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(db.doc(`users/${user.uid}`), {
      name, email, role: "journalist", isActive: true, position, bio: "", photoUrl: "", createdAt: now,
    });
    batch.set(db.doc(`profiles/${user.uid}`), {
      name, position, bio: "", photoUrl: "", role: "journalist", isActive: true, updatedAt: now,
    });
    await batch.commit();
  } catch (err) {
    // Gagal menulis profil: hapus akun supaya tidak ada akun "setengah jadi"
    console.error("[create-journalist] firestore:", err.message);
    await admin.auth().deleteUser(user.uid).catch(() => {});
    return json(500, { error: "Gagal menyimpan profil. Akun dibatalkan, coba lagi." });
  }

  return json(200, { uid: user.uid, email });
};
