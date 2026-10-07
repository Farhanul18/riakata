# PROJECT.md — Riakata

> Tempel file ini di awal setiap chat baru dengan AI agar konteks dan nama field tetap seragam.
> Kalau ada yang berubah (field, halaman, warna), **update file ini dulu**, baru minta AI ubah kode.

Versi dokumen: 2 (menambah halaman referensi Antara News)

---

## 1. Ringkasan

**Riakata** adalah media online budaya Indonesia. Tagline: **"Cerita, Budaya, Kita."** Sub-tagline: *Ruang cerita untuk budaya Indonesia.*

Tujuan: tugas kuliah mata kuliah Media Online, dibuat sebagai CMS mini yang benar-benar berfungsi.

Tiga peran pengguna:

| Peran | Akses | Tugas |
|---|---|---|
| **Publik** | Tanpa login | Membaca artikel, mencari, berlangganan newsletter |
| **Jurnalis** (`journalist`) | Login, area `/jurnalis` | Menulis artikel, mengirim ke redaksi, mengirim usulan isu (pitch), merevisi |
| **Redaktur / Editor** (`editor`) | Login, area `/redaksi` | Mereview, menyetujui/menolak/minta revisi, menerbitkan, atur headline, kelola kategori & akun |

Referensi struktur: antaranews.com (pola navigasi, Terkini, Terpopuler, Pilihan Editor, tag, profil penulis, halaman redaksi). Referensi visual: mockup beranda Riakata.

---

## 2. Tech stack

| Kebutuhan | Pilihan | Catatan |
|---|---|---|
| Frontend | HTML + CSS + JavaScript biasa (tanpa framework) | Firebase dimuat lewat CDN (modular SDK, `<script type="module">`) |
| Hosting | Netlify | Auto-deploy dari GitHub |
| Server-side | Netlify Functions (`netlify/functions/`) | Untuk hal yang butuh secret |
| Database | Firebase Firestore | |
| Login | Firebase Authentication (email + password) | Role disimpan di dokumen `users/{uid}` |
| Gambar | Cloudinary | Firebase Storage **tidak dipakai** |
| Editor tulisan | Quill.js via CDN | Output disimpan sebagai HTML |
| Kontrol versi | Git + GitHub | Commit tiap tahap lolos |

Aturan keamanan inti:
- Config Firebase boleh publik. Pengaman data = `firestore.rules`.
- **Cloudinary API Secret dan Firebase Admin key hanya boleh ada di Environment Variables Netlify**, dipakai di `netlify/functions/`. Jangan pernah masuk file JS frontend atau repo.
- Upload Cloudinary: tahap awal pakai *unsigned preset* (dibatasi folder, ukuran, format), tahap akhir ganti ke *signed upload* lewat `cloudinary-sign.js`.
- Guard di frontend (`auth-guard.js`) hanya soal tampilan. Pengaman sebenarnya = Firestore Rules.

---

## 3. Design tokens

> Nilai hex di bawah adalah **perkiraan dari mockup**. Cek ulang dengan eyedropper, lalu koreksi di sini dan di `base.css`.

### Warna

| Token CSS | Perkiraan | Dipakai untuk |
|---|---|---|
| `--color-bg` | `#F6F1EA` | Latar halaman (krem hangat) |
| `--color-surface` | `#FBF8F3` | Kartu, panel |
| `--color-border` | `#E3DACB` | Garis tipis, border kartu |
| `--color-text` | `#1E1B18` | Teks utama, judul |
| `--color-text-muted` | `#6E655B` | Teks sekunder, meta (menit baca, tanggal) |
| `--color-primary` | `#C84A25` | Aksen terakota: menu aktif, tombol, garis bawah judul |
| `--color-primary-dark` | `#A93A1A` | Hover tombol |
| `--color-green-dark` | `#27312B` | Footer, kartu "Ikuti Kami" |
| `--color-olive` | `#6F7B3A` | Badge kategori Gaya Hidup |
| `--color-blush` | `#F5DDD5` | Latar kartu newsletter |

Badge kategori: Budaya (putih/outline di hero), Tradisi (terakota), Gaya Hidup (olive). Warna badge kategori lain ditentukan di tahap 1 dan dicatat di sini.

### Tipografi

| Peran | Font (Google Fonts) | Fallback |
|---|---|---|
| Judul / headline / navbar | **Montserrat** (600-800) | system-ui, sans-serif |
| Teks isi / UI | **Plus Jakarta Sans** (400-600) | system-ui, sans-serif |
| Aksen tulisan tangan | **Caveat** (opsional) | cursive |
| Logo | Placeholder teks "Riakata" dulu, diganti file SVG/PNG di `assets/logo/` | |

### Lainnya
- Radius kartu: 8-12px. Bayangan sangat halus.
- Layout beranda: container maks ~1280px, grid utama 2 kolom (konten + sidebar ~340px).
- Mobile-first. Breakpoint: 640px, 900px, 1200px.
- Tombol & link harus punya state `:hover` dan `:focus-visible`.

---

## 4. Daftar halaman

### Publik
| URL cantik | File | Isi |
|---|---|---|
| `/` | `index.html` | Beranda sesuai mockup + baris Topik Hangat |
| `/kategori/:slug` | `kategori.html?k=` | Daftar artikel per kategori |
| `/artikel/:slug` | `artikel.html?slug=` | Detail artikel |
| `/terkini` | `daftar.html?tipe=terkini` | Semua artikel terbaru |
| `/terpopuler` | `daftar.html?tipe=terpopuler` | Urut views |
| `/pilihan-editor` | `daftar.html?tipe=pilihan` | Artikel `isEditorPick` |
| `/tag/:tag` | `daftar.html?tipe=tag&t=` | Artikel per tag |
| `/penulis/:id` | `penulis.html?id=` | Profil + tulisan satu jurnalis |
| `/cari?q=` | `cari.html` | Hasil pencarian |
| `/tim-redaksi` | `tim-redaksi.html` | Susunan redaksi dan jurnalis |
| `/tentang` | `tentang.html` | |
| `/pedoman` | `pedoman.html` | Pedoman redaksi/pemberitaan, hak jawab & koreksi, hak cipta |
| `/kontak` | `kontak.html` | |
| `/privasi` | `privasi.html` | |
| `/login` | `login.html` | Satu login, redirect sesuai role |
| (404) | `404.html` | |

### Jurnalis (wajib login, role `journalist`)
| File | Isi |
|---|---|
| `jurnalis/dashboard.html` | Daftar artikel milik sendiri + status + catatan revisi |
| `jurnalis/tulis.html` | Tulis/edit artikel (Quill), upload cover, simpan draft, kirim ke redaksi |
| `jurnalis/pitch.html` | Kirim usulan isu |

### Redaksi (wajib login, role `editor`)
| File | Isi |
|---|---|
| `redaksi/dashboard.html` | Antrean artikel, pitch masuk, statistik singkat |
| `redaksi/review.html` | Baca, komentar, setujui / minta revisi / tolak / terbitkan |
| `redaksi/artikel.html` | Semua artikel, atur Headline dan Pilihan Editor, arsipkan |
| `redaksi/kategori.html` | Kelola kategori **dan** Topik Hangat |
| `redaksi/pengguna.html` | Undang/kelola akun jurnalis |
| `redaksi/subscriber.html` | Daftar email newsletter |

### Fitur bonus (kalau waktu sisa)
Galeri foto/video, Liputan Khusus (seri artikel), Arsip per bulan/tahun, dark mode, bookmark, auto-save draft.

---

## 5. Struktur folder

```
riakata/
├── index.html
├── kategori.html
├── artikel.html
├── daftar.html              ← terkini / terpopuler / pilihan-editor / tag
├── penulis.html
├── cari.html
├── tim-redaksi.html
├── login.html
├── tentang.html
├── pedoman.html
├── kontak.html
├── privasi.html
├── 404.html
│
├── jurnalis/
│   ├── dashboard.html
│   ├── tulis.html
│   └── pitch.html
│
├── redaksi/
│   ├── dashboard.html
│   ├── review.html
│   ├── artikel.html
│   ├── kategori.html
│   ├── pengguna.html
│   └── subscriber.html
│
├── assets/
│   ├── css/
│   │   ├── base.css          ← reset + design tokens + tipografi
│   │   ├── components.css    ← navbar, kartu, tombol, badge, chip, footer
│   │   ├── style.css         ← layout halaman publik
│   │   ├── article.css       ← tampilan detail artikel
│   │   ├── auth.css          ← login
│   │   └── dashboard.css     ← jurnalis & redaksi
│   ├── js/
│   │   ├── firebase-config.js
│   │   ├── auth-guard.js
│   │   ├── utils.js
│   │   ├── cloudinary.js
│   │   ├── main.js
│   │   ├── fb-index.js
│   │   ├── fb-kategori.js
│   │   ├── fb-artikel.js
│   │   ├── fb-daftar.js
│   │   ├── fb-penulis.js
│   │   ├── fb-cari.js
│   │   ├── fb-tim-redaksi.js
│   │   ├── fb-login.js
│   │   ├── fb-jurnalis-dashboard.js
│   │   ├── fb-jurnalis-tulis.js
│   │   ├── fb-jurnalis-pitch.js
│   │   ├── fb-redaksi-dashboard.js
│   │   ├── fb-redaksi-review.js
│   │   ├── fb-redaksi-artikel.js
│   │   ├── fb-redaksi-kategori.js
│   │   ├── fb-redaksi-pengguna.js
│   │   └── fb-redaksi-subscriber.js
│   ├── images/
│   └── logo/
│
├── netlify/functions/
│   ├── cloudinary-sign.js
│   ├── create-journalist.js
│   ├── og-artikel.js         ← opsional, meta tag preview share
│   └── rss.js                ← menghasilkan /rss.xml dari Firestore
│
├── netlify.toml
├── firestore.rules
├── package.json
├── .env.example
├── .gitignore
├── robots.txt
├── sitemap.xml
├── PROJECT.md
└── README.md
```

**Aturan path:** semua link CSS/JS/gambar pakai **path absolut** (`/assets/css/base.css`), bukan relatif. Kalau tidak, aset hilang di subfolder `jurnalis/` dan `redaksi/`.

### Redirect URL cantik (`netlify.toml`)
```
/artikel/:slug      → /artikel.html?slug=:slug
/kategori/:slug     → /kategori.html?k=:slug
/terkini            → /daftar.html?tipe=terkini
/terpopuler         → /daftar.html?tipe=terpopuler
/pilihan-editor     → /daftar.html?tipe=pilihan
/tag/:tag           → /daftar.html?tipe=tag&t=:tag
/penulis/:id        → /penulis.html?id=:id
/rss.xml            → /.netlify/functions/rss
```

---

## 6. Kategori

Slug tetap (jangan diubah tanpa update semua file):

| Nama | Slug |
|---|---|
| Budaya | `budaya` |
| Tradisi | `tradisi` |
| Seni | `seni` |
| Gaya Hidup | `gaya-hidup` |
| Tokoh | `tokoh` |
| Opini | `opini` |

Kategori disimpan di Firestore (`categories`) agar editor bisa mengubah, tapi enam di atas jadi data awal (seed).

---

## 7. Alur redaksi dan status artikel

```
draft → submitted → in_review → needs_revision ⇄ (kembali ke jurnalis → submitted)
                              → approved → published → archived
                              → rejected
```

| Status | Arti | Siapa yang bisa mengubah |
|---|---|---|
| `draft` | Masih ditulis jurnalis | Jurnalis (pemilik) |
| `submitted` | Dikirim ke redaksi | Jurnalis (pemilik) |
| `in_review` | Sedang direview editor | Editor |
| `needs_revision` | Dikembalikan dengan catatan | Editor |
| `approved` | Disetujui, belum tayang | Editor |
| `published` | Tayang di publik | Editor |
| `rejected` | Ditolak (wajib ada catatan) | Editor |
| `archived` | Diturunkan dari publik | Editor |

Aturan:
- Hanya **editor** yang boleh mengubah status menjadi `approved`, `published`, `rejected`, `archived`.
- Jurnalis hanya boleh mengedit artikel miliknya saat status `draft` atau `needs_revision`.
- Setiap perubahan status dicatat di `articles/{id}/revisions` (siapa, kapan, dari status apa ke apa, catatan).
- Hanya **satu** artikel boleh `isHeadline: true`. Saat editor menetapkan headline baru, lakukan dalam satu batch: matikan yang lama, nyalakan yang baru.

---

## 8. Struktur data Firestore

> Nama field **bahasa Inggris**, teks UI **bahasa Indonesia**. Semua timestamp pakai Firestore `Timestamp`.

### `users/{uid}`
```
name: string
email: string
role: "editor" | "journalist"
bio: string
photoUrl: string        // URL Cloudinary
position: string        // contoh: "Pemimpin Redaksi", "Jurnalis"
isActive: boolean
createdAt: Timestamp
```

### `articles/{articleId}`
```
title: string
slug: string            // unik, huruf kecil, pakai tanda hubung
excerpt: string         // ringkasan 1-2 kalimat
content: string         // HTML dari Quill
coverUrl: string        // URL Cloudinary
coverAlt: string        // wajib diisi
coverCredit: string     // kredit/sumber foto
category: string        // slug kategori
tags: string[]          // huruf kecil, tanpa spasi berlebih
authorId: string        // uid
authorName: string      // disalin agar tidak perlu join
status: string          // lihat bagian 7
isHeadline: boolean
isEditorPick: boolean
readingTime: number     // menit, dihitung otomatis (kata / 200)
views: number
editorNote: string      // catatan terakhir dari editor (untuk ditampilkan ke jurnalis)
createdAt: Timestamp
updatedAt: Timestamp
submittedAt: Timestamp | null
publishedAt: Timestamp | null
```

### `articles/{articleId}/revisions/{revId}`
```
fromStatus: string
toStatus: string
note: string
byUid: string
byName: string
createdAt: Timestamp
```

### `issues/{issueId}` (pitch / usulan isu)
```
title: string
summary: string
reason: string          // kenapa isu ini penting
deadline: Timestamp | null
status: "submitted" | "accepted" | "rejected"
editorNote: string
authorId: string
authorName: string
createdAt: Timestamp
```

### `categories/{slug}`
```
name: string
slug: string
icon: string            // nama ikon
order: number
```

### `subscribers/{docId}`
```
email: string
createdAt: Timestamp
```
(Gunakan email ter-normalisasi sebagai ID dokumen supaya tidak ada duplikat.)

### `settings/site` (satu dokumen)
```
hotTopics: string[]     // tag untuk baris "Topik Hangat"
```

### Index Firestore yang akan dibutuhkan
- `articles`: `status` + `publishedAt` (desc)
- `articles`: `status` + `category` + `publishedAt` (desc)
- `articles`: `status` + `views` (desc)
- `articles`: `status` + `isEditorPick` + `publishedAt` (desc)
- `articles`: `status` + `tags` (array-contains) + `publishedAt` (desc)
- `articles`: `authorId` + `updatedAt` (desc)

---

## 9. Firestore Security Rules (ringkasan aturan)

- **Publik:** boleh membaca `articles` hanya jika `status == "published"`; boleh membaca `categories`, `settings`, dan profil dasar `users` (tanpa email). Boleh menambah `subscribers` (hanya `create`, field divalidasi).
- **Jurnalis:** boleh membuat artikel dengan `authorId == uid`; boleh mengedit artikelnya sendiri hanya saat `draft` / `needs_revision`; hanya boleh mengubah status ke `draft` atau `submitted`; tidak boleh menyentuh `isHeadline`, `isEditorPick`, `views`, `publishedAt`. Boleh membuat dan membaca `issues` miliknya.
- **Editor:** boleh membaca dan mengubah semua artikel dan issue, mengubah status apa pun, mengatur headline dan pilihan editor, mengelola `categories`, `settings`, dan `users`.
- **View counter:** kenaikan `views` oleh publik dibatasi lewat aturan khusus (hanya `+1`, hanya field `views`), atau dipindah ke Netlify Function bila terlalu rumit.
- Role dibaca dari dokumen `users/{uid}`.

---

## 10. Cloudinary

- Folder: `riakata/covers`, `riakata/authors`, `riakata/misc`.
- Tahap awal: **unsigned upload preset** (batasi folder, ukuran maks ~5 MB, format jpg/png/webp).
- Tahap akhir: **signed upload** via `netlify/functions/cloudinary-sign.js`.
- Simpan **URL asli** di Firestore, tambahkan transformasi saat ditampilkan lewat fungsi helper di `utils.js`, contoh: `.../upload/f_auto,q_auto,w_800/...`.
- Ukuran responsif: kartu kecil `w_400`, kartu sedang `w_800`, hero `w_1400`.
- `coverAlt` dan `coverCredit` wajib diisi saat upload cover.

---

## 11. Fitur halaman beranda (sesuai mockup + tambahan)

Urutan dari atas ke bawah:
1. Top bar: tagline kecil, kolom pencarian, ikon sosmed, ikon menu (mobile)
2. Header: logo + tagline, navbar (Beranda, Budaya, Tradisi, Seni, Gaya Hidup, Tokoh, Opini)
3. **Baris Topik Hangat** (chip dari `settings/site.hotTopics`) — *tambahan*
4. Hero (artikel `isHeadline`) + 2 kartu samping (artikel terbaru pilihan editor)
5. Strip "Jelajahi Kategori" (6 ikon bulat)
6. "Artikel Terbaru" (grid 4 kartu) + tombol "Lihat Semua" ke `/terkini`
7. Sidebar: "Paling Banyak Dibaca" (top 5), newsletter, "Ikuti Kami"
8. Footer: logo, Tentang Kami, Pedoman Redaksi, Kontak, sosmed, copyright

Aturan tampilan waktu: artikel < 24 jam tampil relatif ("2 jam lalu"), selebihnya tanggal format Indonesia (`12 Apr 2025`).

---

## 12. Konvensi kode

- Bahasa UI: **Indonesia**. Nama variabel, fungsi, field: **Inggris**.
- Penamaan file: huruf kecil, pakai tanda hubung. JS Firebase: `fb-<halaman>.js`.
- CSS: pakai variabel dari `base.css`, **jangan hardcode warna**. Penamaan kelas gaya BEM ringan (`.card`, `.card__title`, `.card--featured`).
- JS: ES modules, `async/await`, satu fungsi satu tugas. Fungsi umum (format tanggal, slug, waktu baca, URL Cloudinary, escape HTML) hanya ada di `utils.js`.
- Semua konten dari database yang ditampilkan lewat `innerHTML` **wajib di-escape** (kecuali `content` artikel, yang disanitasi/dibatasi dari Quill).
- Setiap halaman punya: `<title>`, `meta description`, `viewport`, dan tag Open Graph dasar.
- Gambar selalu punya `alt`, `loading="lazy"` (kecuali hero), dan `width/height` agar tidak loncat.
- Tangani 3 kondisi di setiap daftar data: **loading**, **kosong**, **error**.
- Query Firestore: selalu pakai `limit()`, pagination dengan "Muat lebih banyak".
- Komentar kode secukupnya dalam bahasa Indonesia agar mudah dijelaskan saat presentasi.

---

## 13. Rencana pengerjaan dan status

Tandai `[x]` setelah tahap lolos tes dan sudah di-commit.

- [ ] **Tahap 0 — Setup:** project Firebase (Auth + Firestore), akun Cloudinary + upload preset, repo GitHub, sambung Netlify, folder kosong, `.gitignore`, `README.md`
- [ ] **Tahap 1 — Fondasi tampilan:** `base.css`, `components.css`, logo, favicon (+ `styleguide.html` untuk uji, hapus sebelum rilis)
- [ ] **Tahap 2 — Beranda statis (dummy):** `index.html`, `style.css`, `main.js`, responsif, deploy pertama
- [ ] **Tahap 3 — Login & guard:** `firebase-config.js`, `utils.js`, `login.html`, `auth.css`, `fb-login.js`, `auth-guard.js`
- [ ] **Tahap 4 — Jurnalis:** `cloudinary.js`, `dashboard.css`, `tulis.html`, `jurnalis/dashboard.html`
- [ ] **Tahap 5 — Redaksi + Rules:** `redaksi/dashboard.html`, `review.html`, `artikel.html`, `firestore.rules`
- [ ] **Tahap 6 — Publik terhubung data:** `fb-index.js`, `artikel.html` + `article.css`, `kategori.html`, `daftar.html` (terkini/terpopuler/pilihan/tag), `cari.html`, view counter
- [ ] **Tahap 7 — Pelengkap:** `pitch.html`, `redaksi/kategori.html` (+ Topik Hangat), `pengguna.html` + `create-journalist.js`, `subscriber.html`, newsletter, `penulis.html`, `tim-redaksi.html`, halaman statis
- [ ] **Tahap 8 — Poles:** `netlify.toml`, signed upload, `rss.js`, `robots.txt`, `sitemap.xml`, `og-artikel.js`, Lighthouse, tes di HP

**Batas minimum (jika waktu mepet):** tahap 0 sampai 6.
**Boleh dikorbankan:** pitch, subscriber, penulis, tim-redaksi, og-artikel, rss, galeri/seri/arsip.

---

## 14. Aturan untuk AI saat membantu proyek ini

1. Selalu ikuti struktur folder, nama file, nama field, dan slug di dokumen ini. Jangan mengarang nama baru. Jika perlu perubahan, sebutkan dulu agar PROJECT.md bisa diperbarui.
2. Kerjakan **maksimal 1-3 file yang saling terkait** per jawaban.
3. Pakai path absolut untuk semua aset.
4. Jangan menaruh secret apa pun di kode frontend.
5. Jelaskan singkat cara kerja bagian penting (auth, query, upload) supaya pemilik proyek bisa menjelaskannya saat presentasi.
6. Di akhir tiap jawaban, berikan **checklist tes** (apa yang harus dicek di browser) dan pesan commit yang disarankan.
7. Jika ada error, minta: pesan error di Console (F12), file yang bermasalah, dan langkah yang dilakukan sebelum error muncul.


Tahap 0: Setup (nggak ada kode halaman)

Folder kosong sesuai struktur
.gitignore, README.md (kerangka), PROJECT.md (sudah ada)
Akun/project Firebase, Cloudinary, repo GitHub, Netlify

Tahap 1: Fondasi tampilan

assets/css/base.css
assets/css/components.css
assets/logo/ (placeholder) dan assets/images/

Tahap 2: Beranda statis (data dummy)

index.html
assets/css/style.css
assets/js/main.js

Tahap 3: Login

firebase-config.js
utils.js
login.html + auth.css + fb-login.js
auth-guard.js

Tahap 4: Jurnalis

cloudinary.js
dashboard.css
jurnalis/tulis.html + fb-jurnalis-tulis.js
jurnalis/dashboard.html + fb-jurnalis-dashboard.js

Tahap 5: Redaksi

redaksi/dashboard.html + fb-redaksi-dashboard.js
redaksi/review.html + fb-redaksi-review.js
redaksi/artikel.html + fb-redaksi-artikel.js
firestore.rules

Tahap 6: Halaman publik terhubung data asli

fb-index.js (beranda jadi dinamis)
artikel.html + article.css + fb-artikel.js
kategori.html + fb-kategori.js
daftar.html + fb-daftar.js
cari.html + fb-cari.js
netlify.toml versi dasar (redirect URL cantik, baru kepake di sini)

Tahap 7: Pelengkap

jurnalis/pitch.html + fb-jurnalis-pitch.js
redaksi/kategori.html + fb-redaksi-kategori.js
redaksi/pengguna.html + fb-redaksi-pengguna.js + netlify/functions/create-journalist.js + package.json
redaksi/subscriber.html + fb-redaksi-subscriber.js
penulis.html + fb-penulis.js
tim-redaksi.html + fb-tim-redaksi.js
Halaman statis: tentang, pedoman, kontak, privasi, 404

Tahap 8: Poles

cloudinary-sign.js + .env.example
rss.js
robots.txt, sitemap.xml
og-artikel.js (opsional)