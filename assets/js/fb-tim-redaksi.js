/* ==========================================================
   fb-tim-redaksi.js — halaman Tim Redaksi (dari koleksi publik "profiles")
   ========================================================== */
import { db, collection, query, where, getDocs } from "./firebase-config.js";
import { describeError } from "./articles.js";
import { avatarHtml, errorHtml, emptyHtml } from "./render.js";
import { escapeHtml, href } from "./utils.js";

const teamEl = document.getElementById("team");

function personHtml(p) {
  return `<article class="person">
    ${avatarHtml(p, "lg")}
    <h3 class="person__name">${escapeHtml(p.name || "")}</h3>
    ${p.position ? `<p class="person__role">${escapeHtml(p.position)}</p>` : ""}
    ${p.bio ? `<p class="person__bio">${escapeHtml(p.bio)}</p>` : ""}
    <a class="link-more" href="${href(`/penulis/${encodeURIComponent(p.id)}`)}">Lihat tulisan</a>
  </article>`;
}

function group(title, people) {
  if (!people.length) return "";
  return `<h2 class="group-title">${title}</h2><div class="people-grid">${people.map(personHtml).join("")}</div>`;
}

async function load() {
  try {
    const snap = await getDocs(query(collection(db, "profiles"), where("isActive", "==", true)));
    const people = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const editors = people.filter((p) => p.role === "editor");
    const journalists = people.filter((p) => p.role !== "editor");
    teamEl.innerHTML = people.length
      ? group("Redaksi", editors) + group("Jurnalis", journalists)
      : emptyHtml("Profil tim belum ditampilkan", "Daftar akan muncul setelah redaksi melengkapi profil.");
  } catch (err) {
    teamEl.innerHTML = errorHtml(describeError(err));
    teamEl.addEventListener("click", (e) => { if (e.target.closest("[data-retry]")) load(); }, { once: true });
  }
}

load();
