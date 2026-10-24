# Panduan Deploy AnwarOS — Langkah demi Langkah

Kodenya sudah jadi dan sudah dites. Bagian kamu cuma 5 langkah di bawah ini.
Satu langkah selesai dulu, baru lanjut. Kalau ada yang error, kirim screenshot error-nya ke Robin, jangan ditebak sendiri.

Yang kamu butuhin:
- Akun Gmail kamu (buat daftar Cloudflare)
- Laptop kamu (Node.js sudah terinstall dari project belajar React kemarin, jadi ga perlu install ulang)
- Folder project ini

---

## Langkah 1 — Bikin akun Cloudflare (gratis)

1. Buka https://dash.cloudflare.com/sign-up
2. Daftar pakai email Gmail kamu + bikin password.
3. Buka Gmail, klik link verifikasi dari Cloudflare.
4. Kalau ditanya mau tambah website / pilih plan, **skip / pilih Free** saja. Kita ga pakai bagian website-nya.

> Ga perlu kartu kredit buat yang kita pakai ini (Workers Free).

## Langkah 2 — Buka folder project di terminal

1. Ekstrak file zip project ini ke folder yang gampang dicari, misal `C:\Users\Anwar\anwaros-cloudflare`
2. Buka folder itu di VS Code.
3. Di VS Code, buka terminal: menu **Terminal → New Terminal**. Pastikan alamat di terminal nunjuk ke folder `anwaros-cloudflare`.

## Langkah 3 — Login Wrangler ke akun Cloudflare kamu

Di terminal itu, ketik:

```
npx wrangler login
```

Browser bakal kebuka minta izin → klik **Allow**. Kalau terminal akhirnya nulis kamu sudah login, langkah ini beres.

## Langkah 4 — Bikin "buku catatan" (KV) dan masukin id-nya

Di terminal yang sama, ketik:

```
npx wrangler kv namespace create ANWAROS_KV
```

Hasilnya bakal keluar sebuah `id` (deretan huruf + angka panjang). Copy id itu.

Terus buka file `wrangler.toml`, cari baris ini:

```
id = "GANTI_DENGAN_ID_KV_KAMU"
```

Ganti tulisan di dalam tanda kutip dengan id yang tadi kamu copy. Simpan file-nya (Ctrl+S).

## Langkah 5 — Deploy

Di terminal, ketik:

```
npx wrangler deploy
```

Kalau berhasil, bakal keluar alamat kayak:

```
https://anwaros.<nama-kamu>.workers.dev
```

**Itu alamat AnwarOS kamu.** Cuma kamu yang punya alamat itu.

## Langkah 6 — Tes pertama

1. Buka alamat itu di browser, tambahin `/run` di belakangnya:
   `https://anwaros.<nama-kamu>.workers.dev/run`
   → harusnya muncul tulisan JSON dengan `"ok": true`.
2. Terus buka alamat utamanya (tanpa `/run`).
   → harusnya muncul daftar lowongan frontend remote hari ini, yang paling baru ada label **BARU**.
3. Buka `/run` sekali lagi, terus refresh halaman utama.
   → label BARU harusnya hilang semua, karena AnwarOS sudah "kenal" lowongan itu. Itu bukti buku catatannya (KV) bekerja.

Sesudah ini kamu ga perlu ngapa-ngapain lagi. Tiap hari jam 07.00 WIB dia jalan sendiri, laptop mati pun tetep jalan.

---

## Kalau sudah jalan — buat portfolio

1. Upload folder ini ke GitHub sebagai repo baru namanya `anwaros-cloudflare` (jangan upload folder `node_modules` — sudah otomatis ke-skip).
2. Di README GitHub sudah ada penjelasan project-nya (bahasa Inggris, siap dibaca HRD).
3. Tambahin link repo + link live `workers.dev` kamu ke website portfolio kamu.
4. Kalimat buat CV (boleh copy):
   > Built AnwarOS, a personal serverless job watcher on Cloudflare Workers (JavaScript, Cron Triggers, Workers KV) that fetches public job APIs daily, filters front-end roles with custom rules, and deduplicates listings — running 24/7 on the free tier.

## Troubleshooting cepat

- **`npx wrangler` error / ga dikenal** → terminalnya belum di folder project, atau Node belum kebaca. Tutup VS Code, buka lagi, coba lagi.
- **Error soal KV / namespace id** → langkah 4 belum bener: id di `wrangler.toml` masih tulisan contoh, atau salah copy. Cek lagi baris `id = ...`.
- **Halaman utama kosong / belum ada data** → jalanin `/run` sekali (langkah 6), terus refresh.
- **Deploy minta pilih akun / workers.dev subdomain** → ikuti saja pilihannya, itu cuma sekali di awal buat nentuin nama alamat kamu.
