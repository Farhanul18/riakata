/* ==========================================================
   sitemap.js — sitemap.xml dinamis (alamat: /sitemap.xml)
   Isi: halaman utama, kategori, penulis, dan semua artikel terbit (maks. 1000).
   ========================================================== */
const { getAdmin, siteUrl, escapeHtml } = require("./lib/firebase");

const STATIC_PAGES = ["/", "/terkini", "/terpopuler", "/pilihan-editor", "/tim-redaksi", "/tentang", "/pedoman", "/kontak", "/privasi"];
const DEFAULT_CATEGORIES = ["budaya", "tradisi", "seni", "gaya-hidup", "tokoh", "opini"];

const url = (loc, lastmod) => `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;

exports.handler = async (event) => {
  let admin;
  try { admin = getAdmin(); } catch {
    return { statusCode: 500, body: "Server belum dikonfigurasi." };
  }
  const site = siteUrl(event);
  const db = admin.firestore();

  try {
    const [articles, categories, profiles] = await Promise.all([
      db.collection("articles").where("status", "==", "published").orderBy("publishedAt", "desc").limit(1000).get(),
      db.collection("categories").get(),
      db.collection("profiles").where("isActive", "==", true).get(),
    ]);

    const categorySlugs = categories.empty ? DEFAULT_CATEGORIES : categories.docs.map((d) => d.data().slug || d.id);
    const rows = [
      ...STATIC_PAGES.map((p) => url(site + p)),
      ...categorySlugs.map((c) => url(`${site}/kategori/${encodeURIComponent(c)}`)),
      ...profiles.docs.map((d) => url(`${site}/penulis/${encodeURIComponent(d.id)}`)),
      ...articles.docs.map((d) => {
        const a = d.data();
        const date = a.updatedAt?.toDate?.() || a.publishedAt?.toDate?.();
        return url(`${site}/artikel/${encodeURIComponent(a.slug)}`, date ? date.toISOString().slice(0, 10) : "");
      }),
    ];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
      body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>`,
    };
  } catch (err) {
    console.error("[sitemap]", err.message);
    return { statusCode: 500, body: "Gagal membuat sitemap." };
  }
};
