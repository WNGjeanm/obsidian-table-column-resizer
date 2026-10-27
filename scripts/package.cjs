const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const JSZip = require('jszip');
const root = path.resolve(__dirname, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const versions = JSON.parse(fs.readFileSync(path.join(root, 'versions.json')));
  if (manifest.version !== pkg.version || versions[manifest.version] !== manifest.minAppVersion) throw new Error('Version declarations disagree');
  const originalLicense = execFileSync('git', ['show', 'bb989d5d33bcc532981f4feaad43659bdefd995a:LICENSE'], { cwd: root });
  const licenseText = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n');
  if (licenseText !== originalLicense.toString('utf8').replace(/\r\n/g, '\n')) throw new Error('Original MIT license changed');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  if (!main.includes('Copyright (c) 2024 SOLO Builder') || !main.includes('Permission is hereby granted')) throw new Error('Bundled license missing');
  const files = ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'INSTALL.md'];
  const dist = path.join(root, 'dist'); fs.mkdirSync(dist, { recursive: true });
  const zip = new JSZip();
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file));
    fs.writeFileSync(path.join(dist, file), bytes);
    zip.file(`${manifest.id}/${file}`, bytes, { date: new Date('2026-10-27T00:00:00Z') });
  }
  const name = `table-column-resizer-performance-${manifest.version}.zip`;
  const zipBytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(path.join(dist, name), zipBytes);
  const archive = await JSZip.loadAsync(zipBytes);
  const expected = files.map(file => `${manifest.id}/${file}`).sort();
  const actual = Object.values(archive.files).filter(file => !file.dir).map(file => file.name).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Unexpected ZIP contents');
  for (const file of files) {
    const unpacked = await archive.file(`${manifest.id}/${file}`).async('nodebuffer');
    if (!unpacked.equals(fs.readFileSync(path.join(root, file)))) throw new Error(`ZIP mismatch: ${file}`);
  }
  const artifacts = [...files, name];
  const sums = artifacts.map(file => `${sha(fs.readFileSync(path.join(dist, file)))}  ${file}`).join('\n') + '\n';
  fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), sums);
  const allowed = [...artifacts, 'SHA256SUMS.txt'].sort();
  if (JSON.stringify(fs.readdirSync(dist).sort()) !== JSON.stringify(allowed)) throw new Error('Stale or unexpected distribution files');
  console.log(`Verified ${manifest.version}: ${files.length} ZIP entries, ${allowed.length} release assets, original MIT license retained.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
