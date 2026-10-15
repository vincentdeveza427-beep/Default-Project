// apply-leaderboard-patch.js
// Run from the folder that contains index.html, progress.html, flashcards.html, admin.html,
// server.js, game.js and theme.css (and the new social.js, leaderboard.html, profile.html):
//     node apply-leaderboard-patch.js
// What it does:
//   - server.js    : mounts social.js (profile + avatar + leaderboard API)
//   - game.js      : adds SD.avatarHtml() / SD.esc() / avatar choices
//   - theme.css    : adds the round avatar style
//   - index.html   : Leaderboard link, and your avatar in the top-right chip
//   - progress.html: Leaderboard link, "Edit profile" button
//   - flashcards.html, admin.html: Leaderboard link
// Originals are backed up in ./backup-before-leaderboard/. Safe to run twice (patched files are skipped).

const fs = require('fs');
const path = require('path');

const backupDir = path.join(process.cwd(), 'backup-before-leaderboard');
let problems = 0;

function backup(file, original) {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  const dest = path.join(backupDir, file);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, original);
}

// edits: [exact text that must appear exactly once, replacement]
function patch(file, marker, edits) {
  if (!fs.existsSync(file)) { console.log('SKIP  ' + file + ' (not found)'); problems++; return; }
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes(marker)) { console.log('OK    ' + file + ' (already patched)'); return; }
  let src = original;
  for (const [needle, repl] of edits) {
    const count = src.split(needle).length - 1;
    if (count !== 1) { console.log('FAIL  ' + file + ': expected 1 match, found ' + count + ' for: ' + needle.slice(0, 70)); problems++; return; }
    src = src.replace(needle, function () { return repl; });
  }
  backup(file, original);
  fs.writeFileSync(file, src);
  console.log('SAVED ' + file);
}

const NAV_OLD = '<a href="progress.html">Dashboard</a>';
const NAV_NEW = '<a href="progress.html">Dashboard</a><a href="leaderboard.html">Leaderboard</a>';

// ---------- server.js ----------
patch('server.js', "require('./social.js')", [
  ['// ---- teacher / admin ----',
   "// ---- profile pictures + daily/weekly leaderboard (see social.js) ----\n" +
   "require('./social.js')({ app, auth, supabase, listAllUsers, listAllActivity, fetchAllRows, effectiveRole, rateLimit, baseLimit, limitMsg });\n\n" +
   '// ---- teacher / admin ----']
]);

// ---------- game.js ----------
const GAME_BLOCK = [
  '/* ---------- avatars (profile pictures) ---------- */',
  "SD.AVATAR_EMOJIS = ['\u{1F98A}', '\u{1F43C}', '\u{1F438}', '\u{1F989}', '\u{1F419}', '\u{1F984}', '\u{1F422}', '\u{1F42C}', '\u{1F981}', '\u{1F42F}', '\u{1F435}', '\u{1F427}',",
  "                     '\u{1F98B}', '\u{1F41D}', '\u{1F680}', '\u{1F52C}', '\u{1F9EA}', '\u{1F9EC}', '\u{1FA90}', '\u269B\uFE0F', '\u{1F30B}', '\u{1F9F2}', '\u{1F4A1}', '\u{1F52D}'];",
  "SD.AVATAR_COLORS = ['#28e0c5', '#5aa9ff', '#ffc857', '#ff6b7a', '#a78bfa', '#34d399', '#fb923c', '#f472b6'];",
  'SD.esc = function (s) {',
  "  return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]; });",
  '};',
  '// av: { kind:\'emoji\', emoji, color } | { kind:\'img\', url } | null (-> colored circle with the first letter of the name)',
  'SD.avatarHtml = function (av, name, size) {',
  '  size = size || 40;',
  "  var st = 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.5) + 'px';",
  "  if (av && av.kind === 'img' && av.url) return '<span class=\"av\" style=\"' + st + '\"><img src=\"' + SD.esc(av.url) + '\" alt=\"\"></span>';",
  '  var bg, txt;',
  "  if (av && av.kind === 'emoji') { bg = av.color; txt = av.emoji; }",
  '  else {',
  "    var s = String(name || '?').trim(), h = 0, i;",
  '    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;',
  "    bg = SD.AVATAR_COLORS[h % SD.AVATAR_COLORS.length]; txt = (s.charAt(0) || '?').toUpperCase();",
  '  }',
  "  return '<span class=\"av\" style=\"' + st + ';background:' + SD.esc(bg) + '\">' + SD.esc(txt) + '</span>';",
  '};',
  '',
  '/* ---------- toasts, level-up, confetti ---------- */'
].join('\n');
patch('game.js', 'SD.avatarHtml', [['/* ---------- toasts, level-up, confetti ---------- */', GAME_BLOCK]]);

// ---------- theme.css (append) ----------
(function () {
  const file = 'theme.css';
  if (!fs.existsSync(file)) { console.log('SKIP  ' + file + ' (not found)'); problems++; return; }
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes('.av{')) { console.log('OK    ' + file + ' (already patched)'); return; }
  backup(file, original);
  fs.writeFileSync(file, original + '\n\n/* avatars */\n' +
    '.av{display:inline-grid;place-items:center;border-radius:50%;overflow:hidden;flex:none;font-weight:800;color:#04222f;line-height:1;vertical-align:middle;border:1px solid rgba(255,255,255,.14)}\n' +
    '.av img{width:100%;height:100%;object-fit:cover;display:block}\n');
  console.log('SAVED ' + file);
})();

// ---------- index.html ----------
const NAV_AV_FN =
  "let navAv = null;\n" +
  "async function loadNavAvatar() {\n" +
  "  try {\n" +
  "    if (!navAv) { const r = await fetch('/api/profile', { headers: { Authorization: 'Bearer ' + SD.token() } }); if (!r.ok) return; navAv = await r.json(); }\n" +
  "    const el = $('navAv');\n" +
  "    if (el) el.innerHTML = SD.avatarHtml(navAv.avatar, user && user.name, 24);\n" +
  "  } catch {}\n" +
  "}\n" +
  "function renderNav() {";
patch('index.html', 'navAv', [
  [NAV_OLD, NAV_NEW],
  ['function renderNav() {', NAV_AV_FN],
  ['<b id="navLvl">1</b><span class="nm" id="navName"></span>', '<b id="navLvl">1</b><span id="navAv"></span><span class="nm" id="navName"></span>'],
  ["$('navLvl').textContent = stats ? stats.lvl.level : '1';", "$('navLvl').textContent = stats ? stats.lvl.level : '1';\n  loadNavAvatar();"]
]);

// ---------- progress.html ----------
patch('progress.html', 'leaderboard.html', [
  ['<a class="on" href="progress.html">Dashboard</a>', '<a class="on" href="progress.html">Dashboard</a><a href="leaderboard.html">Leaderboard</a>'],
  ["<em>badge bonus XP</em></span></div></div>';", "<em>badge bonus XP</em></span></div><a class=\"btn ghost sm\" href=\"profile.html\" style=\"margin-top:12px\">Edit profile</a></div>';"]
]);

// ---------- flashcards.html, admin.html ----------
patch('flashcards.html', 'leaderboard.html', [[NAV_OLD, NAV_NEW]]);
patch('admin.html', 'leaderboard.html', [[NAV_OLD, NAV_NEW]]);

console.log(problems
  ? '\nFinished with ' + problems + ' problem(s). Files with problems were left untouched.'
  : '\nAll done. Originals are in backup-before-leaderboard/.\nNext: run supabase-profiles.sql in Supabase (skip if you only use users.json), then restart the server.');
