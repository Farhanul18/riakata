/* ==========================================================
   og-artikel.js — menyisipkan meta tag (judul, deskripsi, gambar) ke halaman artikel
   Crawler WhatsApp, Instagram, Facebook, X, dan Telegram TIDAK menjalankan JavaScript,
   jadi tanpa ini pratinjau tautan kosong. Pembaca biasa tetap menerima halaman yang sama;
   JavaScript di browser tetap mengisi isi artikelnya.
   Alur: /artikel/<slug> (rewrite di netlify.toml) -> function ini -> ambil artikel.html,
         sisipkan meta tag dari Firestore, kirim.
   ========================================================== */
const { getAdmin, siteUrl, escapeHtml } = require("./lib/firebase");

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ganti atau tambahkan satu <meta>. */
function setMeta(html, attr, key, content) {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}">`;
  const re = new RegExp(`<meta\\s+${attr}="${reEscape(key)}"[^>]*>`, "i");
  return re.test(html) ? html.replace(re, () => tag) : html.replace("</head>", () => `  ${tag}\n</head>`);
}

function slugFromEvent(event) {
  try {
    const path = new URL(event.rawUrl).pathname;
    const part = path.split("/artikel/")[1];
    if (part) return decodeURIComponent(part.split("/")[0]);
  } catch { /* lanjut ke cadangan */ }
  const fallback = (event.path || "").split("/artikel/")[1] || (event.queryStringParameters || {}).slug || "";
  return decodeURIComponent(fallback.split("/")[0] || "");
}

exports.handler = async (event) => {
  const site = siteUrl(event);
  const slug = slugFromEvent(event);

  // Template halaman (file statis artikel.html)
  let template;
  try {
    const res = await fetch(`${site}/artikel.html`);
    if (!res.ok) throw new Error(`template ${res.status}`);
    template = await res.text();
  } catch (err) {
    console.error("[og-artikel] template:", err.message);
    return { statusCode: 302, headers: { Location: `/artikel.html?slug=${encodeURIComponent(slug)}` }, body: "" };
  }

  const html = (statusCode, body, cache) => ({
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate", ...(cache ? { "Netlify-CDN-Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } : {}) },
    body,
  });

  let article = null;
  try {
    if (slug) {
      const snap = await getAdmin().firestore().collection("articles")
        .where("status", "==", "published").where("slug", "==", slug).limit(1).get();
      article = snap.empty ? null : snap.docs[0].data();
    }
  } catch (err) {
    console.error("[og-artikel] firestore:", err.message);
    return html(200, template, false); // gagal membaca data: kirim template, JavaScript tetap bekerja
  }

  if (!article) return html(404, template, false); // JavaScript akan menampilkan "Artikel tidak ditemukan"

  const pageUrl = `${site}/artikel/${encodeURIComponent(article.slug)}`;
  const title = `${article.title} — Riakata`;
  const description = article.excerpt || "Cerita, Budaya, Kita.";
  const image = article.coverUrl ? article.coverUrl.replace("/upload/", "/upload/f_jpg,q_auto,c_fill,g_auto,w_1200,h_630/") : "";
  const published = article.publishedAt?.toDate?.();
  const modified = article.updatedAt?.toDate?.() || published;

  let out = template.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`);
  out = setMeta(out, "name", "description", description);
  out = setMeta(out, "property", "og:type", "article");
  out = setMeta(out, "property", "og:title", article.title);
  out = setMeta(out, "property", "og:description", description);
  out = setMeta(out, "property", "og:url", pageUrl);
  out = setMeta(out, "name", "twitter:card", image ? "summary_large_image" : "summary");
  if (image) out = setMeta(out, "property", "og:image", image);
  if (published) out = setMeta(out, "property", "article:published_time", published.toISOString());

  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description,
    image: image ? [image] : undefined,
    datePublished: published?.toISOString(),
    dateModified: modified?.toISOString(),
    author: { "@type": "Person", name: article.authorName || "Redaksi Riakata" },
    publisher: { "@type": "Organization", name: "Riakata", logo: { "@type": "ImageObject", url: `${site}/assets/logo/favicon.svg` } },
    mainEntityOfPage: pageUrl,
  }).replace(/</g, "\\u003c");

  out = out.replace("</head>", () => `  <link rel="canonical" href="${escapeHtml(pageUrl)}">\n  <script type="application/ld+json">${ld}</script>\n</head>`);
  return html(200, out, true);
};
