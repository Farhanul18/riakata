/* ==========================================================
   fb-penulis.js — profil dan tulisan satu penulis (?id=UID atau /penulis/UID)
   Profil dibaca dari koleksi publik "profiles" (tanpa email).
   ========================================================== */
import { db, doc, getDoc } from "./firebase-config.js";
import { fetchPublished } from "./articles.js";
import { mountArticleList, avatarHtml } from "./render.js";
import { routeParam } from "./utils.js";

const $ = (id) => document.getElementById(id);
const id = routeParam("id", "/penulis");

let profile = null;
if (id) {
  try {
    const snap = await getDoc(doc(db, "profiles", id));
    profile = snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn("[profil]", err.code || err);
  }
}

function showHeader(person) {
  const name = person.name || "Penulis";
  document.title = `${name} — Riakata`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", person.bio || `Tulisan ${name} di Riakata.`);
  $("author-name").textContent = name;
  $("author-position").textContent = person.position || "";
  $("author-bio").textContent = person.bio || "";
  $("author-avatar").innerHTML = avatarHtml(person, "lg");
}

if (!id) {
  $("author-name").textContent = "Penulis tidak ditemukan";
  $("list-grid").innerHTML = "";
} else {
  if (profile) showHeader(profile);

  mountArticleList({
    listEl: $("list-grid"),
    statusEl: $("list-status"),
    moreBtn: $("load-more"),
    fetchPage: async (cursor) => {
      const res = await fetchPublished({ authorId: id, cursor, pageSize: 12 });
      // Belum ada profil publik: pakai nama dari artikelnya
      if (!profile && res.items[0]) { profile = { name: res.items[0].authorName }; showHeader(profile); }
      return res;
    },
    emptyTitle: profile ? "Belum ada tulisan terbit" : "Penulis tidak ditemukan",
    emptyText: profile ? "Tulisan akan muncul di sini setelah diterbitkan." : "Alamatnya mungkin salah.",
  })();
}
