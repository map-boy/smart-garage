import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); } };
walk(path.join(root, 'src'));
for (const f of ['vite.config.ts', 'index.html', 'docs/firestore-hub-rules.txt']) { const p = path.join(root, f); if (fs.existsSync(p)) files.push(p); }
files.sort();
const h = crypto.createHash('sha256');
for (const f of files) h.update(path.relative(root, f).replace(/\\/g, '/') + '\n' + fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') + '\n');
const hash = h.digest('hex').slice(0, 12);
const rp = path.join(root, 'README.md');
const readme = fs.readFileSync(rp, 'utf8');
const m = readme.match(/<!-- code-hash: (\w+) -->/);
if (process.argv.includes('--stamp')) {
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(rp, readme.replace(/<!-- code-hash: \w+ -->/, '<!-- code-hash: ' + hash + ' -->').replace(/Last updated: [\d-]+/, 'Last updated: ' + today));
  console.log('README stamped ' + hash);
} else if (!m || m[1] !== hash) {
  console.error('\nREADME.md is out of date: the code changed but the README was not updated.\nUpdate README.md (Changelog + any changed sections), then run: npm run readme:stamp\n');
  process.exit(1);
} else { console.log('README is in sync'); }