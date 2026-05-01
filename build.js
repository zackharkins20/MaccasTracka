// Substitutes Supabase env vars into index.html at deploy time.
// Vercel sets SUPABASE_URL and SUPABASE_ANON_KEY in Project Settings → Environment Variables.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'index.html');
const OUT_DIR = path.join(__dirname, 'dist');
const OUT = path.join(OUT_DIR, 'index.html');

// Trim — `echo | vercel env add` injects trailing newlines that break JS
const url = (process.env.SUPABASE_URL || '').trim();
const key = (process.env.SUPABASE_ANON_KEY || '').trim();

if (!url || !key) {
  console.warn('⚠ SUPABASE_URL / SUPABASE_ANON_KEY not set — site will fall back to localStorage-only mode.');
}

const html = fs.readFileSync(SRC, 'utf8')
  .replace(/%%SUPABASE_URL_VALUE%%/g, url)
  .replace(/%%SUPABASE_ANON_KEY_VALUE%%/g, key);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`✓ Built ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
