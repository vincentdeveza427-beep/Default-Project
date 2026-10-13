// apply-v3-patch.js
// Run from the folder that contains science-drill-1.html ... science-drill-6.html and index.html:
//     node apply-v3-patch.js
// What it does:
//   - Drill pages: adds <script src="drill-tools.js"></script> (navigator, flags, shortcuts, review tools, practice mode).
//   - index.html: adds a "Practice" button next to Timed exam / Flashcards.
// Originals are backed up in ./backup-before-v3/. Safe to run twice (already-patched files are skipped).

const fs = require('fs');
const path = require('path');

const backupDir = path.join(process.cwd(), 'backup-before-v3');
let problems = 0;

function backup(file, original) {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  const dest = path.join(backupDir, file);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, original);
}

function patchDrill(file) {
  if (!fs.existsSync(file)) { console.log('SKIP  ' + file + ' (not found)'); problems++; return; }
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes('drill-tools.js')) { console.log('OK    ' + file + ' (already patched)'); return; }
  const i = original.lastIndexOf('</body>');
  if (i < 0) { console.log('FAIL  ' + file + ': no </body> found'); problems++; return; }
  const src = original.slice(0, i) + '<script src="drill-tools.js"></script>\n' + original.slice(i);
  backup(file, original);
  fs.writeFileSync(file, src);
  console.log('SAVED ' + file);
}

// each edit: [exact text that must appear once, replacement]
const INDEX_EDITS = [
  ['<button data-mode="flashcards">\u{1F0CF} Flashcards</button>',
   '<button data-mode="flashcards">\u{1F0CF} Flashcards</button><button data-mode="practice">\u270D\uFE0F Practice</button>'],
  ['  flashcards: { page: \'flashcards.html\',',
   '  practice: { direct: true, cta: \'Start practice \u2192\', info: \'Self-paced with no timer. Saved to your account, optional shuffling, instant feedback. Practice does not earn XP.\' },\n  flashcards: { page: \'flashcards.html\','],
  ['href="\' + m.page + \'?set=\' + encodeURIComponent(s.href) + \'"',
   'href="\' + (m.direct ? s.href + \'?mode=practice\' : m.page + \'?set=\' + encodeURIComponent(s.href)) + \'"'],
  ['      meter = mode === \'flashcards\'',
   '      meter = mode === \'practice\' ? \'<div class="meter"><div class="row"><span>Self-paced practice</span><span>Saved to your account</span></div></div>\' : mode === \'flashcards\'']
];

function patchIndex(file) {
  if (!fs.existsSync(file)) { console.log('SKIP  ' + file + ' (not found)'); problems++; return; }
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes('data-mode="practice"')) { console.log('OK    ' + file + ' (already patched)'); return; }
  let src = original;
  for (const [needle, repl] of INDEX_EDITS) {
    const count = src.split(needle).length - 1;
    if (count !== 1) { console.log('FAIL  ' + file + ': expected 1 match, found ' + count + ' for: ' + needle.slice(0, 60)); problems++; return; }
    src = src.replace(needle, function () { return repl; });
  }
  backup(file, original);
  fs.writeFileSync(file, src);
  console.log('SAVED ' + file);
}

for (let i = 1; i <= 6; i++) patchDrill('science-drill-' + i + '.html');
patchIndex('index.html');

console.log(problems ? '\nFinished with ' + problems + ' problem(s). Files with problems were left untouched.' : '\nAll done. Originals are in backup-before-v3/.');
