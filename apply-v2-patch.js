// apply-v2-patch.js
// Run from the folder that contains science-drill-1.html ... science-drill-6.html and index.html:
//     node apply-v2-patch.js
// What it does:
//   - Drill pages: removes the Google Apps Script submission (scores are now saved to your account by timed.html),
//     and auto-fills + locks the name from the logged-in account.
//   - index.html: shows an "Admin" button to teacher accounts.
// Originals are backed up in ./backup-before-v2/. Safe to run twice (already-patched files are skipped).

const fs = require('fs');
const path = require('path');

const NEW_SUBMIT = `function submitScore(name, score, total){
  // Practice result only: the timed-exam page (timed.html) saves the score to the student's account.
  const statusEl = document.getElementById('submitStatus');
  submitted = true;
  clearProgress();
  if(window.parent !== window){
    statusEl.className = 'ok';
    statusEl.textContent = 'Submitted! Your result is saved to your account.';
  } else {
    statusEl.className = 'pending';
    statusEl.textContent = 'Practice result only - not recorded. Use Timed exam from the home page to save a score to your account.';
  }
}

`;

const AUTOFILL = `// Name comes from the logged-in account (read-only) so names are consistent for the teacher.
(function(){
  var t = null;
  try{ t = localStorage.getItem('sd_token'); }catch(e){}
  if(!t) return;
  fetch('/api/me', { headers: { Authorization: 'Bearer ' + t } })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(u){ if(u){ nameInput.value = u.name || u.email; nameInput.readOnly = true; } })
    .catch(function(){});
})();
`;

const backupDir = path.join(process.cwd(), 'backup-before-v2');
let problems = 0;

function backup(file, original) {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  const dest = path.join(backupDir, file);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, original);
}

function patchDrill(file) {
  if (!fs.existsSync(file)) { console.log('SKIP  ' + file + ' (not found)'); problems++; return; }
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes('Practice result only')) { console.log('OK    ' + file + ' (already patched)'); return; }
  let src = original;

  const a = src.indexOf('function submitScore(');
  const b = src.indexOf('function revealAll(');
  if (a < 0 || b < 0 || b < a) { console.log('FAIL  ' + file + ': could not find submitScore()/revealAll()'); problems++; return; }
  src = src.slice(0, a) + NEW_SUBMIT + src.slice(b);

  src = src.replace(/(?:\/\/ Paste[^\n]*\n)?const SUBMIT_URL = [^\n]*\n\n?/, '');

  const r = src.lastIndexOf('render(getRange());');
  if (r < 0) { console.log('FAIL  ' + file + ': could not find the final render call'); problems++; return; }
  src = src.slice(0, r) + AUTOFILL + src.slice(r);

  if (src.includes('SUBMIT_URL')) { console.log('FAIL  ' + file + ': SUBMIT_URL is still referenced'); problems++; return; }
  backup(file, original);
  fs.writeFileSync(file, src);
  console.log('SAVED ' + file);
}

function patchIndex(file) {
  if (!fs.existsSync(file)) { console.log('SKIP  ' + file + ' (not found)'); problems++; return; }
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes('admin.html')) { console.log('OK    ' + file + ' (already patched)'); return; }
  const needle = `tb.innerHTML = '<a class="lvlchip"`;
  if (original.split(needle).length !== 2) { console.log('FAIL  ' + file + ': could not find the nav line'); problems++; return; }
  const src = original.replace(needle,
    `tb.innerHTML = (user.role === 'admin' ? '<a class="btn ghost sm" href="admin.html">Teacher</a>' : '') + '<a class="lvlchip"`);
  backup(file, original);
  fs.writeFileSync(file, src);
  console.log('SAVED ' + file);
}

for (let i = 1; i <= 6; i++) patchDrill('science-drill-' + i + '.html');
patchIndex('index.html');

console.log(problems ? '\nFinished with ' + problems + ' problem(s). Files with problems were left untouched.' : '\nAll done. Originals are in backup-before-v2/.');
