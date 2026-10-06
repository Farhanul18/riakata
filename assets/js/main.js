/* ==========================================================
   main.js — perilaku umum untuk semua halaman publik
   1) menu mobile  2) penanda menu aktif  3) validasi pencarian
   4) form newsletter (sementara belum tersambung ke Firestore)
   ========================================================== */

/* ---------- 1) Menu mobile ---------- */
const navToggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('nav');

function setMenu(open) {
  if (!nav || !navToggle) return;
  nav.classList.toggle('is-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
}

if (nav && navToggle) {
  navToggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));

  // Tutup saat menekan Esc, klik di luar menu, atau memilih tautan
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setMenu(false);
      navToggle.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('is-open') && !nav.contains(e.target) && !navToggle.contains(e.target)) setMenu(false);
  });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

  // Kalau layar melebar ke ukuran desktop, pastikan menu kembali normal
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
}

/* ---------- 2) Tandai menu aktif sesuai alamat halaman ---------- */
(function markActiveNav() {
  const links = document.querySelectorAll('.nav__link');
  if (!links.length) return;
  const here = location.pathname.replace(/\/+$/, '') || '/';
  // Beranda juga bisa dibuka lewat /index.html
  const current = here === '/index.html' ? '/' : here;
  let found = false;
  links.forEach((a) => {
    const target = new URL(a.href, location.origin).pathname.replace(/\/+$/, '') || '/';
    if (target === current) { a.setAttribute('aria-current', 'page'); found = true; }
  });
  // Kalau ada yang cocok, hapus penanda dari yang lain
  if (found) links.forEach((a) => {
    const target = new URL(a.href, location.origin).pathname.replace(/\/+$/, '') || '/';
    if (target !== current) a.removeAttribute('aria-current');
  });
})();

/* ---------- 3) Pencarian: jangan kirim kalau kosong ---------- */
document.querySelectorAll('.search').forEach((form) => {
  form.addEventListener('submit', (e) => {
    const input = form.querySelector('input[name="q"]');
    if (input && !input.value.trim()) {
      e.preventDefault();
      input.focus();
    }
  });
});

/* ---------- 4) Newsletter ---------- */
const nlForm = document.getElementById('newsletter-form');
const nlInput = document.getElementById('newsletter-email');
const nlStatus = document.getElementById('newsletter-status');

function showNewsletterStatus(message, type) {
  nlStatus.textContent = message;
  nlStatus.classList.toggle('is-success', type === 'success');
  nlStatus.classList.toggle('is-error', type === 'error');
}

// TODO (Tahap 7): ganti isi fungsi ini dengan penyimpanan ke Firestore
// (koleksi "subscribers", ID dokumen = email huruf kecil agar tidak dobel).
async function subscribeEmail(email) {
  console.info('[newsletter] belum tersambung ke database:', email);
  return { ok: true };
}

if (nlForm && nlInput && nlStatus) {
  nlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = nlInput.value.trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    nlInput.setAttribute('aria-invalid', String(!valid));
    if (!valid) {
      showNewsletterStatus('Alamat email belum benar. Contoh: nama@email.com', 'error');
      nlInput.focus();
      return;
    }

    const button = nlForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await subscribeEmail(email);
      if (!result.ok) throw new Error('gagal');
      showNewsletterStatus('Terima kasih! Kamu sudah terdaftar.', 'success');
      nlForm.reset();
    } catch {
      showNewsletterStatus('Pendaftaran gagal. Coba lagi sebentar.', 'error');
    } finally {
      button.disabled = false;
    }
  });
}
