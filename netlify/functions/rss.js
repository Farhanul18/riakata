/* ==========================================================
   rss.js — umpan RSS 2.0 untuk 30 artikel terbit terbaru (alamat: /rss.xml)
   ========================================================== */
const { getAdmin, siteUrl, escapeHtml } = require("./lib/firebase");

/** Bungkus teks dalam CDATA dengan aman. */
const cdata = (text) => `<![CDATA[${String(text).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

exports.handler = async (event) => {
  let admin;
  try { admin = getAdmin(); } catch {
    return { statusCode: 500, body: "Server belum dikonfigurasi." };
  }
  const site = siteUrl(event);

  try {
    const snap = await admin.firestore().collection("articles")
      .where("status", "==", "published").orderBy("publishedAt", "desc").limit(30).get();

    const items = snap.docs.map((d) => {
      const a = d.data();
      const link = `${site}/artikel/${encodeURIComponent(a.slug)}`;
      const date = a.publishedAt?.toDate?.() || new Date();
      const image = a.coverUrl ? a.coverUrl.replace("/upload/", "/upload/f_jpg,q_auto,c_fill,g_auto,w_800,h_450/") : "";
      const html = (image ? `<p><img src="${escapeHtml(image)}" alt="${escapeHtml(a.coverAlt || "")}"></p>` : "") +
        `<p>${escapeHtml(a.excerpt || "")}</p>`;
      return `    <item>
      <title>${escapeHtml(a.title)}</title>
      <link>${escapeHtml(link)}</link>
      <guid isPermaLink="true">${escapeHtml(link)}</guid>
      <pubDate>${date.toUTCString()}</pubDate>
      <dc:creator>${escapeHtml(a.authorName || "Redaksi Riakata")}</dc:creator>
      <category>${escapeHtml(a.category || "")}</category>
      <description>${cdata(html)}</description>
    </item>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Riakata</title>
    <link>${escapeHtml(site)}</link>
    <description>Cerita, Budaya, Kita. Ruang cerita untuk budaya Indonesia.</description>
    <language>id</language>
    <atom:link href="${escapeHtml(site)}/rss.xml" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" },
      body: xml,
    };
  } catch (err) {
    console.error("[rss]", err.message);
    return { statusCode: 500, body: "Gagal membuat RSS." };
  }
};
