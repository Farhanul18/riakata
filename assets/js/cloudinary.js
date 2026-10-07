/* ==========================================================
   cloudinary.js — upload gambar ke Cloudinary dari browser
   Mode saat ini: UNSIGNED PRESET (tanpa secret di frontend).
   Tahap 8: diganti signed upload lewat netlify/functions/cloudinary-sign.js.

   Contoh pakai:
     import { uploadImage, FOLDERS } from "/assets/js/cloudinary.js";
     const img = await uploadImage(file, {
       folder: FOLDERS.covers,
       onProgress: (persen) => { bar.value = persen; },
     });
     // img = { url, publicId, width, height, bytes, format }
     // Simpan img.url di Firestore (articles.coverUrl).
     // Saat ditampilkan, tambahkan transformasi lewat cloudinaryUrl() di utils.js.
   ========================================================== */

// Isi dari Cloudinary Dashboard. Keduanya BOLEH publik (bukan API secret).
const CLOUD_NAME = "qsxo2pic";
const UPLOAD_PRESET = "riakata";

/** false selama masih berisi tulisan "ISI_..." */
export const isCloudinaryConfigured =
  !CLOUD_NAME.startsWith("ISI_") && !UPLOAD_PRESET.startsWith("ISI_");

export const FOLDERS = {
  covers: "riakata/covers",
  authors: "riakata/authors",
  misc: "riakata/misc",
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 20 * 1024 * 1024; // file mentah dari kamera HP boleh besar
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // yang dikirim ke Cloudinary maksimal 5 MB
const MAX_DIMENSION = 2000; // sisi terpanjang, piksel

function uploadError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Mengembalikan teks error kalau file tidak layak, atau null kalau aman. */
export function validateImage(file) {
  if (!file) return "Pilih gambar dulu.";
  if (!ALLOWED_TYPES.includes(file.type)) return "Format gambar harus JPG, PNG, atau WebP.";
  if (file.size > MAX_INPUT_BYTES) return "Ukuran gambar terlalu besar (maksimal 20 MB).";
  return null;
}

/**
 * Kecilkan gambar di browser sebelum diunggah (hemat kuota dan lebih cepat).
 * Gambar yang sudah kecil dikembalikan apa adanya. Kalau gagal, pakai file asli.
 */
async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= MAX_UPLOAD_BYTES) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    // PNG tetap PNG (menjaga transparansi), selain itu jadi JPEG
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob || (scale === 1 && blob.size >= file.size)) return file;

    const ext = type === "image/png" ? "png" : "jpg";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type });
  } catch {
    return file;
  }
}

/** Kirim FormData ke Cloudinary. Pakai XMLHttpRequest karena fetch tidak punya progres upload. */
function sendForm(form, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* biarkan kosong */ }

      if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
        resolve({
          url: data.secure_url,
          publicId: data.public_id,
          width: data.width,
          height: data.height,
          bytes: data.bytes,
          format: data.format,
        });
        return;
      }

      const detail = data?.error?.message || `HTTP ${xhr.status}`;
      console.error("[cloudinary] upload gagal:", detail);
      const message = /preset/i.test(detail)
        ? "Upload preset tidak ditemukan atau tidak aktif. Periksa pengaturan Cloudinary."
        : "Gagal mengunggah gambar. Coba lagi sebentar.";
      reject(uploadError("cloudinary", message));
    };

    xhr.onerror = () => reject(uploadError("network", "Koneksi bermasalah. Periksa internet kamu lalu coba lagi."));
    xhr.onabort = () => reject(uploadError("aborted", "Upload dibatalkan."));
    if (signal) signal.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(form);
  });
}

/**
 * Unggah satu gambar. Melempar Error dengan properti `code`:
 * config | invalid | too-large | network | aborted | cloudinary
 * (pesan error-nya sudah berbahasa Indonesia, aman langsung ditampilkan ke pengguna)
 */
export async function uploadImage(file, { folder = FOLDERS.covers, onProgress, signal } = {}) {
  if (!isCloudinaryConfigured) {
    throw uploadError("config", "Cloudinary belum dikonfigurasi. Isi data di assets/js/cloudinary.js.");
  }
  const invalid = validateImage(file);
  if (invalid) throw uploadError("invalid", invalid);

  const body = await shrinkImage(file);
  if (body.size > MAX_UPLOAD_BYTES) {
    throw uploadError("too-large", "Ukuran gambar masih di atas 5 MB setelah dikecilkan. Pilih gambar lain.");
  }

  const form = new FormData();
  form.append("file", body);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", folder);

  // TODO (Tahap 8): ambil signature dari /.netlify/functions/cloudinary-sign,
  // tambahkan api_key, timestamp, signature ke form, dan hapus ketergantungan pada unsigned preset.
  return sendForm(form, { onProgress, signal });
}