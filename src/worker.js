// AnwarOS Cloudflare — v3.1 (logika v2 + tampilan baru)
// Perbaikan v3.1: data lama di KV yang tanggalnya sudah terlanjur rusak (1970, warisan
// sebelum normalisasi v3) sekarang (a) tidak ditampilkan tanggalnya di halaman, dan
// (b) otomatis diperbarui dari data fetch terbaru tiap run kalau lowongannya muncul lagi.
// Perubahan v3 (Fase 3A — kecantikan):
//  - Tampilan ditulis ulang pakai CSS custom (tanpa Bootstrap/framework): header beridentitas,
//    pil statistik, chip warna per sumber, grup "Baru hari ini" vs "Sebelumnya", tanggal
//    relatif ("2 hari lalu"), kotak cari + filter sumber client-side pakai JavaScript vanilla
//  - Bug tanggal Himalayas dibenerin: pubDate mereka kadang detik, kadang milidetik —
//    sekarang dinormalisasi, ga ada lagi tanggal 1970npx wrangler deploy
// Perubahan dari v1 (riwayat v2):
//  1. Sumber nambah 2: Jobicy + Himalayas (total 4 sumber: Remotive, Arbeitnow, Jobicy, Himalayas)
//  2. Halaman utama sekarang AKUMULATIF: nyimpen sampai 50 lowongan terakhir, run kosong
//     TIDAK menghapus temuan sebelumnya (di v1 sekali run kosong, temuan semalam hilang)
//  3. Ada halaman /debug: angka mentah per sumber (berapa yang diambil, berapa yang lolos,
//     sumber mana yang GAGAL fetch) — di v1 kegagalan sumber disembunyikan, sekarang kelihatan
//  4. Saringan dituning: blockchain/web3/crypto/solidity/nft dibuang; level "Senior" dari
//     data sumber juga dibuang; lowongan bisa lolos juga lewat tags/kategori kalau judulnya
//     mengandung kata peran (developer/engineer/programmer/software)
//
// Aturan sumber data tetap sama: semua ini API publik tanpa API key, tanpa scraping,
// dipanggil 1x sehari dari cron (+ manual sesekali), dan tiap kartu selalu link balik
// ke lowongan aslinya + nama sumbernya ditulis.

const CONFIG = {
  includeKeywords: [
    "frontend",
    "front-end",
    "front end",
    "react",
    "javascript",
    "typescript",
    "vue",
    "angular",
    "web developer",
    "web development",
    "ui developer",
    "full stack",
    "fullstack",
    "full-stack",
  ],
  roleWords: ["developer", "engineer", "programmer", "software"],
  excludeKeywords: [
    "senior",
    "sr.",
    "lead",
    "principal",
    "staff",
    "manager",
    "architect",
    "head of",
    "director",
    "blockchain",
    "web3",
    "crypto",
    "solidity",
    "nft",
  ],
  maxHistory: 50,
  maxSeenIds: 1000,
};

const UA = { "User-Agent": "AnwarOS/2.0 (personal job watcher)" };

async function fetchJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// Himalayas ngasih pubDate kadang dalam detik (10 digit), kadang milidetik (13 digit).
// Kalau apa adanya dimasukin ke Date (yang maunya milidetik), yang detik jadi tahun 1970.
function normalizeEpoch(v) {
  if (!v) return "";
  const n = Number(v);
  if (isNaN(n)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  return new Date(n < 1e11 ? n * 1000 : n).toISOString();
}

function salaryText(currency, min, max) {
  if (!min && !max) return "";
  const parts = [currency || "", min || "", max && max !== min ? "- " + max : ""];
  return parts.join(" ").trim();
}

// ---------- Sumber-sumber ----------

async function fetchRemotive() {
  const data = await fetchJson(
    "https://remotive.com/api/remote-jobs?category=software-dev&limit=100"
  );
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.map((j) => ({
    id: `remotive-${j.id}`,
    title: j.title || "",
    company: j.company_name || "-",
    location: j.candidate_required_location || "Remote",
    url: j.url || "",
    source: "Remotive",
    publishedAt: j.publication_date || "",
    salary: j.salary || "",
    tagsText: [...(j.tags || []), j.category || ""].join(" ").toLowerCase(),
    levelText: "",
  }));
}

async function fetchArbeitnow() {
  const data = await fetchJson("https://www.arbeitnow.com/api/job-board-api");
  const jobs = Array.isArray(data.data) ? data.data : [];
  return jobs
    .filter((j) => j.remote === true)
    .map((j) => ({
      id: `arbeitnow-${j.slug}`,
      title: j.title || "",
      company: j.company_name || "-",
      location: j.location || "Remote",
      url: j.url || "",
      source: "Arbeitnow",
      publishedAt: j.created_at
        ? new Date(j.created_at * 1000).toISOString()
        : "",
      salary: "",
      tagsText: (j.tags || []).join(" ").toLowerCase(),
      levelText: "",
    }));
}

async function fetchJobicy() {
  const data = await fetchJson(
    "https://jobicy.com/api/v2/remote-jobs?count=100"
  );
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  return jobs.map((j) => ({
    id: `jobicy-${j.id || j.url || j.jobTitle}`,
    title: j.jobTitle || "",
    company: j.companyName || "-",
    location: j.jobGeo || "Remote",
    url: j.url || "",
    source: "Jobicy",
    publishedAt: j.pubDate ? new Date(j.pubDate).toISOString() : "",
    salary: salaryText(j.salaryCurrency, j.salaryMin, j.salaryMax),
    tagsText: (Array.isArray(j.jobIndustry)
      ? j.jobIndustry.join(" ")
      : String(j.jobIndustry || "")
    ).toLowerCase(),
    levelText: String(j.jobLevel || "").toLowerCase(),
  }));
}

async function fetchHimalayas() {
  // API Himalayas maksimal 20 per halaman — kita ambil sampai 3 halaman pakai cursor
  let all = [];
  let cursor = null;
  for (let page = 0; page < 3; page++) {
    const url =
      "https://himalayas.app/jobs/api?limit=20" +
      (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
    const data = await fetchJson(url);
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    all = all.concat(jobs);
    cursor = data.nextCursor || null;
    if (!cursor) break;
  }
  return all.map((j) => ({
    id: `himalayas-${j.guid || j.applicationLink || j.title}`,
    title: j.title || "",
    company: j.companyName || "-",
    location:
      (j.locationRestrictions || []).map((l) => l.name).join(", ") || "Remote",
    url: j.applicationLink || "",
    source: "Himalayas",
    publishedAt: normalizeEpoch(j.pubDate),
    salary: salaryText(j.currency, j.minSalary, j.maxSalary),
    tagsText: (j.categories || []).join(" ").toLowerCase(),
    levelText: (j.seniority || []).join(" ").toLowerCase(),
  }));
}

const SOURCES = [
  ["Remotive", fetchRemotive],
  ["Arbeitnow", fetchArbeitnow],
  ["Jobicy", fetchJobicy],
  ["Himalayas", fetchHimalayas],
];

// ---------- Saringan ----------

function matchesFilter(job) {
  const title = job.title.toLowerCase();

  // Buang berdasar judul (level + topik di luar target)
  if (CONFIG.excludeKeywords.some((k) => title.includes(k))) return false;

  // Buang berdasar level resmi dari sumber (misal seniority: ["Senior"]),
  // kecuali levelnya juga menyebut entry/junior
  if (
    job.levelText.includes("senior") &&
    !job.levelText.includes("entry") &&
    !job.levelText.includes("junior")
  )
    return false;

  // Lolos jalur 1: kata kunci ada di judul
  if (CONFIG.includeKeywords.some((k) => title.includes(k))) return true;

  // Lolos jalur 2: kata kunci ada di tags/kategori DAN judulnya memang peran teknis
  const hasRole = CONFIG.roleWords.some((w) => title.includes(w));
  if (hasRole && CONFIG.includeKeywords.some((k) => job.tagsText.includes(k)))
    return true;

  return false;
}

function dedupeByUrl(jobs) {
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    if (!job.url || seen.has(job.url)) continue;
    seen.add(job.url);
    out.push(job);
  }
  return out;
}

function cleanJob(job, firstSeenAt) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    source: job.source,
    publishedAt: job.publishedAt,
    salary: job.salary,
    firstSeenAt,
  };
}

// ---------- Penyimpanan KV ----------

async function kvGetJson(env, key, fallback) {
  if (!env.ANWAROS_KV) return fallback;
  try {
    const raw = await env.ANWAROS_KV.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function getHistory(env) {
  const history = await kvGetJson(env, "jobs_history", null);
  if (Array.isArray(history)) return history;
  // Migrasi dari v1: kalau history belum ada, ambil dari latest_jobs-nya v1
  const legacy = await kvGetJson(env, "latest_jobs", null);
  if (legacy && Array.isArray(legacy.jobs)) {
    return legacy.jobs.map((j) => ({ ...j, firstSeenAt: legacy.fetchedAt || "" }));
  }
  return [];
}

async function getLastRun(env) {
  return kvGetJson(env, "last_run", null);
}

// ---------- Kerja utama ----------

async function runJobWatch(env) {
  const nowIso = new Date().toISOString();
  const stats = { at: nowIso, sources: {}, totalRaw: 0, totalPassed: 0, newCount: 0 };

  // Ambil dari semua sumber; kegagalan satu sumber dicatat, bukan disembunyikan
  const results = await Promise.all(
    SOURCES.map(async ([name, fn]) => {
      try {
        const jobs = await fn();
        return { name, ok: true, jobs, error: "" };
      } catch (e) {
        return { name, ok: false, jobs: [], error: String((e && e.message) || e) };
      }
    })
  );

  let allJobs = [];
  for (const r of results) {
    const passed = r.jobs.filter(matchesFilter).length;
    stats.sources[r.name] = { ok: r.ok, raw: r.jobs.length, passed, error: r.error };
    stats.totalRaw += r.jobs.length;
    allJobs = allJobs.concat(r.jobs);
  }

  const allFailed = results.every((r) => !r.ok);

  // Baca catatan lama
  const history = await getHistory(env);
  let seenIds = await kvGetJson(env, "seen_ids", []);
  const seenSet = new Set(seenIds);

  if (allFailed) {
    // Semua sumber mati: JANGAN timpa apa pun. Catat run-nya saja.
    stats.allSourcesFailed = true;
    if (env.ANWAROS_KV) await env.ANWAROS_KV.put("last_run", JSON.stringify(stats));
    return { ok: false, stats, history };
  }

  const dedupedAll = dedupeByUrl(allJobs);
  const passedJobs = dedupedAll.filter(matchesFilter);
  passedJobs.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  stats.totalPassed = passedJobs.length;

  const newJobs = passedJobs.filter((j) => !seenSet.has(j.id));
  stats.newCount = newJobs.length;

  // Gabung: yang baru di depan, sisanya riwayat lama (dedupe berdasar id).
  // Riwayat lama yang lowongannya muncul lagi di run ini: datanya diperbarui dari
  // fetch terbaru (firstSeenAt tetap yang lama) — ini yang menyembuhkan data
  // tersimpan yang tanggalnya rusak dari era sebelum normalisasi v3.
  const newIds = new Set(newJobs.map((j) => j.id));
  // Peta SEMUA lowongan yang terlihat di run ini (sebelum saringan) — buat refresh
  // data riwayat, termasuk yang run ini kebetulan tidak lolos saringan lagi.
  const fetchedById = new Map(dedupedAll.map((j) => [j.id, j]));
  const merged = [
    ...newJobs.map((j) => cleanJob(j, nowIso)),
    ...history
      .filter((j) => !newIds.has(j.id))
      .map((j) => {
        const fresh = fetchedById.get(j.id);
        return fresh ? cleanJob(fresh, j.firstSeenAt) : j;
      }),
  ].slice(0, CONFIG.maxHistory);

  // Update catatan id yang pernah dilihat
  for (const j of passedJobs) if (!seenSet.has(j.id)) seenIds.push(j.id);
  seenIds = seenIds.slice(-CONFIG.maxSeenIds);

  if (env.ANWAROS_KV) {
    await env.ANWAROS_KV.put("jobs_history", JSON.stringify(merged));
    await env.ANWAROS_KV.put("seen_ids", JSON.stringify(seenIds));
    await env.ANWAROS_KV.put("last_run", JSON.stringify(stats));
    // Tetap tulis latest_jobs biar format /api lama tidak kaget
    await env.ANWAROS_KV.put(
      "latest_jobs",
      JSON.stringify({ fetchedAt: nowIso, jobs: merged })
    );
  }

  return { ok: true, stats, history: merged };
}

// ---------- Tampilan (v3 — CSS custom, tanpa framework) ----------

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jakartaDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

// "hari ini" / "kemarin" / "3 hari lalu" / "12 Okt 2026" — dari tanggal posting lowongan
function relativeDate(iso) {
  if (!iso) return "";
  const raw = new Date(iso);
  // Tanggal rusak warisan data lama (sebelum 2000, misal 1970) jangan ditampilkan
  if (isNaN(raw.getTime()) || raw.getTime() < Date.UTC(2000, 0, 1)) return "";
  const posted = jakartaDate(iso);
  if (!posted) return "";
  const today = jakartaDate(new Date().toISOString());
  const diffDays = Math.round(
    (new Date(today + "T00:00:00Z") - new Date(posted + "T00:00:00Z")) / 86400000
  );
  if (isNaN(diffDays) || diffDays < 0) return "";
  if (diffDays === 0) return "hari ini";
  if (diffDays === 1) return "kemarin";
  if (diffDays < 30) return diffDays + " hari lalu";
  return new Date(iso).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const SOURCE_STYLE = {
  Remotive: { color: "#ffb59d", bg: "rgba(255,107,53,.14)", border: "rgba(255,107,53,.35)" },
  Arbeitnow: { color: "#a9c7ff", bg: "rgba(80,130,255,.14)", border: "rgba(80,130,255,.35)" },
  Jobicy: { color: "#d3b3ff", bg: "rgba(150,90,255,.14)", border: "rgba(150,90,255,.35)" },
  Himalayas: { color: "#ffe08a", bg: "rgba(240,180,0,.13)", border: "rgba(240,180,0,.35)" },
};

const SHARED_CSS = `
  :root {
    --bg: #0b0e13; --panel: #141922; --panel2: #171d29; --border: #242c3d;
    --text: #e9edf4; --muted: #98a2b3; --muted2: #626b7d;
    --accent: #6ea8fe; --green: #22c55e;
  }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; background: var(--bg); color: var(--text); }
  main { max-width: 800px; margin: 0 auto; padding: 28px 16px 56px; }
  a { color: var(--accent); }
`;

function renderCard(job, isNew) {
  const s = SOURCE_STYLE[job.source] || { color: "#c7cedb", bg: "rgba(255,255,255,.07)", border: "rgba(255,255,255,.16)" };
  const rel = relativeDate(job.publishedAt);
  const searchText = (job.title + " " + job.company + " " + job.location).toLowerCase();
  return `
      <article class="card" data-source="${escapeHtml(job.source)}" data-search="${escapeHtml(searchText)}">
        <div class="card-top">
          <h3>${escapeHtml(job.title)}</h3>
          ${isNew ? '<span class="badge-new">BARU</span>' : ""}
        </div>
        <p class="meta">${escapeHtml(job.company)} &middot; ${escapeHtml(job.location)}${rel ? ` &middot; <span class="date">diposting ${escapeHtml(rel)}</span>` : ""}</p>
        <div class="chips">
          <span class="chip" style="color:${s.color};background:${s.bg};border-color:${s.border}">${escapeHtml(job.source)}</span>
          ${job.salary ? `<span class="chip chip-salary">${escapeHtml(job.salary)}</span>` : ""}
        </div>
        <a class="apply" href="${escapeHtml(job.url)}" target="_blank" rel="noopener">Lihat &amp; lamar di sumber aslinya &rarr;</a>
      </article>`;
}

function renderPage(history, lastRun) {
  const today = jakartaDate(new Date().toISOString());
  const checked = lastRun?.at
    ? new Date(lastRun.at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : null;
  const activeSources = lastRun?.sources
    ? Object.values(lastRun.sources).filter((s) => s.ok).length
    : 0;

  const newJobs = history.filter((j) => jakartaDate(j.firstSeenAt) === today);
  const oldJobs = history.filter((j) => jakartaDate(j.firstSeenAt) !== today);
  const sourcesPresent = [...new Set(history.map((j) => j.source))];

  const section = (title, jobs, isNewGroup) =>
    jobs.length === 0
      ? ""
      : `
    <section class="group">
      <h2 class="group-title">${title} <span class="group-count">${jobs.length}</span></h2>
      ${jobs.map((j) => renderCard(j, isNewGroup)).join("")}
    </section>`;

  const filterChips =
    sourcesPresent.length > 1
      ? `
    <div class="toolbar">
      <input id="q" type="search" placeholder="Cari judul / perusahaan..." autocomplete="off">
      <div class="filters">
        <button class="fbtn active" data-filter="semua">Semua</button>
        ${sourcesPresent.map((s) => `<button class="fbtn" data-filter="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}
      </div>
    </div>`
      : "";

  const body =
    history.length === 0
      ? `<p class="empty">Belum ada lowongan yang lolos saringan. Buka <a href="/debug">/debug</a> buat liat angka per sumber, atau tunggu jadwal harian jam 07.00 WIB.</p>`
      : filterChips +
        section("Baru hari ini", newJobs, true) +
        section("Sebelumnya", oldJobs, false) +
        `<p id="noresult" class="empty" hidden>Tidak ada yang cocok sama filter itu.</p>`;

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AnwarOS — Lowongan Frontend Remote</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%236ea8fe'/%3E%3Ctext x='50' y='68' font-size='52' text-anchor='middle' fill='white' font-family='Arial' font-weight='bold'%3EA%3C/text%3E%3C/svg%3E">
<style>
  ${SHARED_CSS}
  header { display: flex; gap: 14px; align-items: center; margin-bottom: 6px; }
  .logo { width: 46px; height: 46px; border-radius: 12px; background: linear-gradient(135deg, #6ea8fe, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; color: #fff; flex-shrink: 0; }
  h1 { font-size: 25px; margin: 0; letter-spacing: -.02em; }
  .tagline { color: var(--muted); margin: 2px 0 0; font-size: 14px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 6px; }
  .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px; font-size: 13px; color: var(--muted); }
  .stat b { color: var(--text); }
  .toolbar { margin: 20px 0 4px; }
  #q { width: 100%; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel); color: var(--text); font-size: 14px; outline: none; }
  #q:focus { border-color: var(--accent); }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .fbtn { background: var(--panel); color: var(--muted); border: 1px solid var(--border); padding: 6px 13px; border-radius: 999px; font-size: 13px; cursor: pointer; }
  .fbtn:hover { color: var(--text); }
  .fbtn.active { background: var(--accent); border-color: var(--accent); color: #081120; font-weight: 700; }
  .group-title { font-size: 15px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 26px 0 4px; display: flex; align-items: center; gap: 8px; }
  .group-count { background: var(--panel2); border: 1px solid var(--border); color: var(--text); border-radius: 999px; padding: 1px 9px; font-size: 12px; letter-spacing: 0; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; margin: 10px 0; transition: transform .15s ease, border-color .15s ease; }
  .card:hover { transform: translateY(-2px); border-color: var(--accent); }
  .card-top { display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; }
  .card h3 { font-size: 16.5px; margin: 0; line-height: 1.35; }
  .badge-new { background: var(--green); color: #04150a; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 999px; flex-shrink: 0; margin-top: 2px; }
  .meta { color: var(--muted); font-size: 13.5px; margin: 7px 0 0; }
  .meta .date { color: var(--muted2); }
  .chips { display: flex; flex-wrap: wrap; gap: 7px; margin: 11px 0 13px; }
  .chip { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; border: 1px solid; }
  .chip-salary { color: #7be2a0; background: rgba(34,197,94,.12); border-color: rgba(34,197,94,.35); }
  .apply { display: inline-block; text-decoration: none; font-size: 14px; font-weight: 600; }
  .apply:hover { text-decoration: underline; }
  .empty { color: var(--muted); margin-top: 22px; }
  footer { color: var(--muted2); font-size: 12.5px; margin-top: 36px; border-top: 1px solid var(--border); padding-top: 16px; line-height: 1.6; }
</style>
</head>
<body>
<main>
  <header>
    <div class="logo">A</div>
    <div>
      <h1>AnwarOS</h1>
      <p class="tagline">Lowongan Frontend Remote &mdash; diperiksa otomatis tiap hari pukul 07.00 WIB</p>
    </div>
  </header>

  <div class="stats">
    <span class="stat"><b>${history.length}</b> lowongan tersimpan</span>
    ${checked ? `<span class="stat">Terakhir dicek <b>${escapeHtml(checked)} WIB</b></span>` : ""}
    ${activeSources ? `<span class="stat"><b>${activeSources}</b> sumber aktif</span>` : ""}
    <span class="stat"><a href="/debug" style="text-decoration:none">Debug &rarr;</a></span>
  </div>

  ${body}

  <footer>
    Sumber data: Remotive, Arbeitnow, Jobicy &amp; Himalayas (API publik, tanpa scraping). Semua tombol lamar mengarah ke situs aslinya.<br>
    AnwarOS &mdash; dibangun dengan Cloudflare Workers, Cron Triggers &amp; Workers KV.
  </footer>
</main>
<script>
  // Filter client-side: kotak cari + chip sumber. Datanya sudah ada di halaman,
  // JavaScript ini cuma menyembunyikan / menampilkan kartu — tidak fetch apa-apa.
  var q = document.getElementById('q');
  var activeFilter = 'semua';
  function applyFilter() {
    var keyword = q ? q.value.toLowerCase().trim() : '';
    var visibleTotal = 0;
    document.querySelectorAll('.group').forEach(function (g) {
      var groupVisible = 0;
      g.querySelectorAll('.card').forEach(function (card) {
        var matchSource = activeFilter === 'semua' || card.dataset.source === activeFilter;
        var matchText = !keyword || card.dataset.search.indexOf(keyword) !== -1;
        var show = matchSource && matchText;
        card.style.display = show ? '' : 'none';
        if (show) { groupVisible++; visibleTotal++; }
      });
      g.style.display = groupVisible > 0 ? '' : 'none';
    });
    var nr = document.getElementById('noresult');
    if (nr) nr.hidden = visibleTotal !== 0;
  }
  if (q) q.addEventListener('input', applyFilter);
  document.querySelectorAll('.fbtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.fbtn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilter();
    });
  });
</script>
</body>
</html>`;
}

function renderDebug(lastRun) {
  const shell = (inner) => `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AnwarOS Debug</title>
<style>${SHARED_CSS}
  h1 { font-size: 22px; }
  table { border-collapse: collapse; width: 100%; margin-top: 14px; }
  td, th { border: 1px solid var(--border); padding: 9px 12px; text-align: left; font-size: 14px; }
  th { background: var(--panel2); }
  .fail { color: #ff9d9d; }
  p { color: var(--muted); }
</style></head>
<body><main>${inner}</main></body></html>`;

  if (!lastRun)
    return shell(`<h1>Debug AnwarOS</h1><p>Belum ada run tercatat. Buka /run dulu.</p><p><a href="/">&larr; balik ke halaman utama</a></p>`);

  const rows = Object.entries(lastRun.sources || {})
    .map(
      ([name, s]) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      <td>${s.ok ? "OK" : '<span class="fail">GAGAL — ' + escapeHtml(s.error || "") + "</span>"}</td>
      <td>${s.raw}</td>
      <td>${s.passed}</td>
    </tr>`
    )
    .join("");

  const at = new Date(lastRun.at).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
  });

  return shell(`
<h1>Debug AnwarOS</h1>
<p>Run terakhir: ${escapeHtml(at)} WIB${lastRun.allSourcesFailed ? ' — <span class="fail">SEMUA SUMBER GAGAL</span>' : ""}</p>
<table>
<tr><th>Sumber</th><th>Status</th><th>Mentah diambil</th><th>Lolos saringan</th></tr>
${rows}
</table>
<p>Total mentah: ${lastRun.totalRaw} &middot; total lolos (sesudah dedupe): ${lastRun.totalPassed} &middot; baru di run ini: ${lastRun.newCount}</p>
<p><a href="/">&larr; balik ke halaman utama</a></p>`);
}

// ---------- Pintu masuk Worker ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/run") {
      const result = await runJobWatch(env);
      return Response.json({
        ok: result.ok,
        totalDiHalaman: result.history.length,
        baruRunIni: result.stats.newCount,
        totalLolosRunIni: result.stats.totalPassed,
        perSumber: result.stats.sources,
      });
    }

    if (url.pathname === "/api") {
      const [history, lastRun] = await Promise.all([
        getHistory(env),
        getLastRun(env),
      ]);
      return Response.json({ fetchedAt: lastRun?.at || null, stats: lastRun, jobs: history });
    }

    if (url.pathname === "/debug") {
      const lastRun = await getLastRun(env);
      return new Response(renderDebug(lastRun), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const [history, lastRun] = await Promise.all([
      getHistory(env),
      getLastRun(env),
    ]);
    return new Response(renderPage(history, lastRun), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runJobWatch(env));
  },
};
