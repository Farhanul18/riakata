/* ==========================================================
   cloudinary-sign.js — membuat "tanda tangan" upload Cloudinary (signed upload)
   Browser meminta tanda tangan, server memeriksa siapa yang meminta,
   lalu browser mengunggah langsung ke Cloudinary. API Secret tidak pernah keluar dari server.
   Variabel lingkungan: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
                        + variabel Firebase (lihat lib/firebase.js)
   ========================================================== */
const crypto = require("crypto");
const { getAdmin, json } = require("./lib/firebase");

const ALLOWED_FOLDERS = ["riakata/covers", "riakata/authors", "riakata/misc"];
const ALLOWED_FORMATS = "jpg,png,webp";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Metode tidak diizinkan." });

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error("[cloudinary-sign] variabel Cloudinary belum diisi");
    return json(500, { error: "Server belum dikonfigurasi (variabel Cloudinary)." });
  }

  let admin;
  try { admin = getAdmin(); } catch {
    return json(500, { error: "Server belum dikonfigurasi (variabel Firebase)." });
  }

  // 1) Harus login
  const token = (event.headers.authorization || event.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Belum login." });
  let caller;
  try { caller = await admin.auth().verifyIdToken(token); } catch {
    return json(401, { error: "Sesi tidak valid. Silakan login ulang." });
  }

  // 2) Harus jurnalis atau redaktur yang aktif (dicek ke database)
  const userDoc = await admin.firestore().doc(`users/${caller.uid}`).get();
  const user = userDoc.exists ? userDoc.data() : null;
  if (!user || !["editor", "journalist"].includes(user.role) || user.isActive !== true) {
    return json(403, { error: "Akun tidak diizinkan mengunggah gambar." });
  }

  // 3) Folder hanya dari daftar yang diizinkan
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Data tidak valid." }); }
  const folder = ALLOWED_FOLDERS.includes(body.folder) ? body.folder : null;
  if (!folder) return json(400, { error: "Folder tidak dikenal." });

  // 4) Tanda tangan = SHA-1 dari parameter (urut abjad) + API Secret
  const params = { allowed_formats: ALLOWED_FORMATS, folder, timestamp: Math.floor(Date.now() / 1000) };
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const signature = crypto.createHash("sha1").update(toSign + CLOUDINARY_API_SECRET).digest("hex");

  return json(200, {
    signature,
    timestamp: params.timestamp,
    folder,
    allowedFormats: ALLOWED_FORMATS,
    apiKey: CLOUDINARY_API_KEY,
    cloudName: CLOUDINARY_CLOUD_NAME,
  });
};
