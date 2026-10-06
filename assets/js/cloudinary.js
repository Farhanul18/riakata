/* ==========================================================
   cloudinary.js — utilitas untuk upload gambar
   Menggunakan metode "Unsigned Upload" dari Cloudinary REST API.
   Cocok untuk tahap awal (Tahap 4) sebelum menggunakan Signed Upload (Tahap 8).
   ========================================================== */

// TODO: Ganti dua nilai ini dengan data dari dashboard Cloudinary kamu nanti.
const CLOUD_NAME = "ISI_CLOUD_NAME_LU_DI_SINI";
const UPLOAD_PRESET = "ISI_UPLOAD_PRESET_LU"; // Pastikan preset ini diset ke "Unsigned" di Cloudinary

// Batas ukuran maksimal gambar (5 MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024; 

/**
 * Mengunggah file gambar ke Cloudinary.
 * @param {File} file - Objek file gambar dari input type="file"
 * @returns {Promise<string>} URL gambar yang sudah diunggah (secure_url)
 * @throws {Error} Jika validasi atau proses unggah gagal
 */
export async function uploadImage(file) {
  if (!file) {
    throw new Error("Tidak ada file yang dipilih.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Format file tidak didukung. Harap unggah gambar.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Ukuran gambar terlalu besar. Maksimal 5 MB.");
  }

  if (CLOUD_NAME.startsWith("ISI_") || UPLOAD_PRESET.startsWith("ISI_")) {
    throw new Error("Cloudinary belum dikonfigurasi. Cek file cloudinary.js.");
  }

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const formData = new FormData();
  
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Gagal mengunggah gambar ke server.");
    }

    // Mengembalikan secure_url (https) yang siap disimpan ke database (Firestore)
    return data.secure_url;
  } catch (err) {
    console.error("[Cloudinary Upload Error]:", err);
    throw new Error(err.message || "Terjadi kesalahan saat mengunggah gambar.");
  }
}