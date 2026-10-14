/* Science Drills - study tools.
   Loaded by every science-drill-N.html AFTER the page's own script. It adds:
   question navigator, flag for review, sticky progress bar, field-of-science tags, keyboard shortcuts (A-D),
   accessible option controls, post-submit review (filters, field breakdown, send wrong answers to flashcards),
   and practice mode (?mode=practice): self-paced, optional shuffling, saved to the account. */
(function () {
'use strict';
if (typeof QUESTIONS === 'undefined' || typeof render !== 'function' || typeof userAnswers === 'undefined') return;

var $ = function (id) { return document.getElementById(id); };
var L = ['A', 'B', 'C', 'D'];
var N = QUESTIONS.length;
var CANON = QUESTIONS.slice();                          // the questions exactly as authored (never reordered)
var SET = (String(STORAGE_KEY).match(/_([A-Z])$/) || [])[1] || 'A';
var SET_FILE = 'science-drill-' + (SET.charCodeAt(0) - 64) + '.html';
var PRACTICE = new URLSearchParams(location.search).get('mode') === 'practice' && window.parent === window;
var FIELD_META = {
  B: { name: 'Biology', color: '#34d399' }, C: { name: 'Chemistry', color: '#ffc857' }, P: { name: 'Physics', color: '#5aa9ff' },
  E: { name: 'Earth Science', color: '#e0a36b' }, A: { name: 'Astronomy', color: '#b79cff' }
};
var FIELDS = null;                                      // letters per CANONICAL question, from question-fields.json
var DISP = []; for (var d0 = 0; d0 < N; d0++) DISP.push(d0);   // displayed position -> canonical index
var FLAGS = new Array(N).fill(0);
var LOCKED = new Array(N).fill(0);                      // practice instant feedback: question already revealed
var activeQ = 0;
var PSTATE = null;                                      // practice state

function token() { try { return localStorage.getItem('sd_token'); } catch (e) { return null; } }
function uid() {
  var t = token(); if (!t) return null;
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id; } catch (e) { return null; }
}
function hdr() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }; }
function cards() { return container.querySelectorAll('.question-card'); }
function fieldOf(i) { return FIELDS && FIELDS[DISP[i]] ? FIELDS[DISP[i]] : null; }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function answeredCount() { var n = 0; for (var i = 0; i < N; i++) if (userAnswers[i] !== null) n++; return n; }
function flaggedCount() { var n = 0; for (var i = 0; i < N; i++) if (FLAGS[i]) n++; return n; }
function statusOf(i) { var ua = userAnswers[i]; return ua === null ? 'skip' : (ua === QUESTIONS[i][2] ? 'ok' : 'wrong'); }

/* ---------------- styles ---------------- */
var style = document.createElement('style');
style.textContent = [
  'body{padding-top:56px}',
  '.progress-bar{display:none}',
  '.question-card{scroll-margin-top:72px}',
  '.option:focus-visible,.sd-btn:focus-visible,.sd-flag:focus-visible,.sd-q:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}',
  '.sd-hide{display:none !important}',
  '#sd-bar{position:fixed;top:0;left:0;right:0;z-index:50;height:48px;display:flex;align-items:center;gap:12px;padding:0 14px;background:rgba(7,27,46,.96);border-bottom:1px solid var(--card-border)}',
  '#sd-prog{flex:1;min-width:70px}',
  '#sd-prog .t{font-size:.74rem;color:var(--muted);display:flex;justify-content:space-between;gap:8px;margin-bottom:3px;white-space:nowrap}',
  '#sd-prog .b{height:6px;border-radius:99px;background:#0a2033;overflow:hidden;border:1px solid var(--card-border)}',
  '#sd-prog .b i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .25s}',
  '.sd-btn{background:transparent;color:var(--accent);border:1.5px solid var(--accent);border-radius:20px;padding:6px 13px;font-weight:700;font-size:.8rem;cursor:pointer;font-family:inherit;white-space:nowrap}',
  '.sd-btn:hover{background:rgba(40,224,197,.1)}',
  '.sd-btn.solid{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#04222f;border:0}',
  '.sd-btn:disabled{opacity:.45;cursor:not-allowed}',
  '.sd-pill{font-size:.72rem;font-weight:800;padding:3px 10px;border-radius:99px;border:1px solid var(--card-border);color:var(--muted);white-space:nowrap}',
  '.sd-pill.mode{color:var(--amber);border-color:rgba(255,204,102,.5)}',
  '.sd-pill.ok{color:var(--correct)}.sd-pill.warn{color:var(--amber)}',
  '#sd-nav{position:fixed;top:48px;right:0;bottom:0;width:340px;max-width:100vw;background:#0b2238;border-left:1px solid var(--card-border);z-index:49;transform:translateX(105%);transition:transform .2s;display:flex;flex-direction:column;padding:14px;gap:10px}',
  '#sd-nav.open{transform:none}',
  '#sd-nav .row{display:flex;justify-content:space-between;align-items:center;gap:8px}',
  '#sd-jump{display:flex;gap:8px;flex-wrap:wrap}',
  '#sd-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;overflow:auto;padding:4px 2px;flex:1;align-content:start}',
  '.sd-q{position:relative;height:38px;border-radius:8px;border:1px solid var(--card-border);background:#0a1e33;color:var(--muted);font-weight:700;font-size:.78rem;cursor:pointer;font-family:inherit}',
  '.sd-q.ans{background:rgba(90,169,255,.18);border-color:var(--accent2);color:var(--text)}',
  '.sd-q.ok{background:rgba(46,204,113,.2);border-color:var(--correct);color:var(--text)}',
  '.sd-q.bad{background:rgba(255,95,109,.2);border-color:var(--wrong);color:var(--text)}',
  '.sd-q.skip{background:rgba(255,204,102,.15);border-color:var(--amber);color:var(--text)}',
  '.sd-q.cur{outline:2px solid var(--accent);outline-offset:1px}',
  '.sd-q.flag::after{content:"";position:absolute;top:3px;right:3px;width:8px;height:8px;border-radius:50%;background:var(--amber)}',
  '#sd-legend{display:flex;gap:10px;flex-wrap:wrap;font-size:.7rem;color:var(--muted)}',
  '#sd-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}',
  '.sd-chips{margin:-6px 0 12px 44px;min-height:0}',
  '.sd-field{display:inline-block;font-size:.7rem;font-weight:800;padding:3px 10px;border-radius:99px;border:1px solid var(--fc);color:var(--fc);background:rgba(255,255,255,.03)}',
  '.sd-flag{margin-left:auto;flex:none;align-self:flex-start;background:transparent;border:1px solid var(--card-border);color:var(--muted);border-radius:8px;padding:4px 10px;cursor:pointer;font-size:.78rem;font-weight:700;font-family:inherit}',
  '.sd-flag[aria-pressed=true]{color:#2a1c00;background:var(--amber);border-color:var(--amber)}',
  '.question-card.sd-flagged{box-shadow:0 0 0 1px rgba(255,204,102,.45) inset}',
  '.sd-overlay{position:fixed;inset:0;background:rgba(3,9,18,.9);z-index:80;display:grid;place-items:center;padding:16px;overflow:auto}',
  '.sd-box{background:var(--card);border:1px solid var(--card-border);border-radius:18px;padding:24px;max-width:480px;width:100%}',
  '.sd-box h2{margin:0 0 8px;font-size:1.3rem}',
  '.sd-box p{color:var(--muted);font-size:.9rem;line-height:1.5;margin:6px 0}',
  '.sd-box label.chk{display:flex;gap:10px;align-items:flex-start;margin:12px 0;font-size:.92rem;cursor:pointer}',
  '.sd-box label.chk input{margin-top:3px;width:18px;height:18px;accent-color:var(--accent)}',
  '.sd-box label.chk small{display:block;color:var(--muted);font-size:.78rem}',
  '.sd-box .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}',
  '.sd-keys{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.88rem;margin-top:10px}',
  '.sd-keys kbd{background:#0a1e33;border:1px solid var(--card-border);border-radius:6px;padding:2px 8px;font-family:inherit;font-weight:700;color:var(--accent);text-align:center}',
  '#sd-results{background:var(--card);border:1px solid var(--card-border);border-radius:16px;padding:20px;margin-bottom:24px}',
  '#sd-results h3{margin:0 0 10px;font-size:1.15rem}',
  '#sd-results h4{margin:18px 0 8px;font-size:.95rem;color:var(--muted)}',
  '.sd-filter{display:flex;gap:8px;flex-wrap:wrap}',
  '.sd-filter button{background:#0a1e33;color:var(--muted);border:1px solid var(--card-border);border-radius:99px;padding:6px 14px;font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit}',
  '.sd-filter button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#04222f}',
  '.sd-frow{display:grid;grid-template-columns:120px 1fr auto;gap:10px;align-items:center;margin:7px 0;font-size:.86rem}',
  '.sd-frow .bar{height:8px;border-radius:99px;background:#0a2033;overflow:hidden;border:1px solid var(--card-border)}',
  '.sd-frow .bar i{display:block;height:100%;border-radius:99px;background:var(--fc)}',
  '.sd-frow .n{color:var(--muted);white-space:nowrap}',
  '.sd-frow.weak .n{color:var(--wrong);font-weight:700}',
  '.sd-send{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px}',
  '.sd-send label{font-size:.84rem;color:var(--muted);display:flex;gap:6px;align-items:center;cursor:pointer}',
  '#sd-send-msg{font-size:.84rem;color:var(--muted)}',
  '#sd-send-msg a{color:var(--accent);font-weight:700}',
  '@media(max-width:560px){#sd-prog .t span:last-child{display:none}.sd-frow{grid-template-columns:96px 1fr auto}.sd-pill.mode{display:none}}'
].join('\n');
document.head.appendChild(style);

function el(tag, id, cls) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; }

/* ---------------- sticky bar + navigator + help ---------------- */
var bar = el('div', 'sd-bar');
bar.innerHTML = '<button class="sd-btn solid" id="sd-nav-btn" type="button" aria-expanded="false" aria-controls="sd-nav">&#9776; Questions</button>' +
  '<div id="sd-prog"><div class="t"><span id="sd-t1"></span><span id="sd-t2"></span></div><div class="b"><i id="sd-pf"></i></div></div>' +
  (PRACTICE ? '<span class="sd-pill mode">Practice</span>' : '') + '<span class="sd-pill hidden" id="sd-sync" style="display:none"></span>' +
  '<button class="sd-btn" id="sd-help-btn" type="button" aria-label="Keyboard shortcuts">?</button>';
document.body.insertBefore(bar, document.body.firstChild);

var nav = el('div', 'sd-nav');
nav.setAttribute('role', 'dialog'); nav.setAttribute('aria-label', 'Question navigator');
nav.innerHTML = '<div class="row"><b>Questions</b><button class="sd-btn" id="sd-nav-close" type="button">Close</button></div>' +
  '<div id="sd-jump"><button class="sd-btn" type="button" data-j="unans">Next unanswered</button><button class="sd-btn" type="button" data-j="flag">Next flagged</button></div>' +
  '<div id="sd-grid"></div>' +
  '<div id="sd-legend"><span><i style="background:rgba(90,169,255,.4)"></i>Answered</span><span><i style="background:#0a1e33;border:1px solid #1c3f5e"></i>Not answered</span><span><i style="background:var(--amber);border-radius:50%"></i>Flagged</span><span><i style="background:rgba(46,204,113,.5)"></i>Correct</span><span><i style="background:rgba(255,95,109,.5)"></i>Wrong</span></div>';
document.body.appendChild(nav);
var grid = $('sd-grid');
for (var gi = 0; gi < N; gi++) {
  var gb = document.createElement('button');
  gb.type = 'button'; gb.className = 'sd-q'; gb.setAttribute('data-i', gi); gb.setAttribute('aria-label', 'Go to question ' + (gi + 1)); gb.textContent = gi + 1;
  grid.appendChild(gb);
}

function openNav(open) {
  if (open === undefined) open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  $('sd-nav-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
}
$('sd-nav-btn').onclick = function () { openNav(); };
$('sd-nav-close').onclick = function () { openNav(false); };

function refreshNav() {
  var ans = answeredCount(), fl = flaggedCount();
  $('sd-t1').textContent = ans + ' / ' + N + ' answered';
  $('sd-t2').textContent = fl ? fl + ' flagged' : '';
  $('sd-pf').style.width = (ans / N * 100) + '%';
  var kids = grid.children;
  for (var i = 0; i < kids.length; i++) {
    var c = 'sd-q';
    if (userAnswers[i] !== null) c += ' ans';
    if (checked) c += ' ' + ({ ok: 'ok', wrong: 'bad', skip: 'skip' })[statusOf(i)];
    if (FLAGS[i]) c += ' flag';
    if (i === activeQ) c += ' cur';
    kids[i].className = c;
  }
}

function goTo(i) {
  var card = $('q' + i); if (!card) return;
  if (card.classList.contains('sd-hide')) setFilter('all');
  activeQ = i;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  var o = card.querySelector('.option[tabindex="0"]') || card.querySelector('.option');
  if (o) { try { o.focus({ preventScroll: true }); } catch (e) { o.focus(); } }
  refreshNav();
  if (window.innerWidth < 700) openNav(false);
}
function findNext(pred) {
  for (var k = 1; k <= N; k++) { var i = (activeQ + k) % N; if (pred(i)) return i; }
  return -1;
}
function jump(kind) {
  var i = kind === 'flag' ? findNext(function (j) { return FLAGS[j]; }) : findNext(function (j) { return userAnswers[j] === null; });
  if (i >= 0) goTo(i);
}
grid.onclick = function (e) { var b = e.target.closest('.sd-q'); if (b) goTo(parseInt(b.getAttribute('data-i'), 10)); };
$('sd-jump').onclick = function (e) { var b = e.target.closest('button'); if (b) jump(b.getAttribute('data-j')); };

/* keep track of which question is on screen */
var ticking = false;
function onScroll() {
  if (ticking) return; ticking = true;
  requestAnimationFrame(function () {
    ticking = false;
    var cs = cards();
    for (var k = 0; k < cs.length; k++) {
      var r = cs[k].getBoundingClientRect();
      if (r.bottom > 150) { var i = parseInt(cs[k].id.slice(1), 10); if (i !== activeQ) { activeQ = i; refreshNav(); } break; }
    }
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
document.addEventListener('focusin', function (e) {
  var c = e.target.closest && e.target.closest('.question-card');
  if (c) { var i = parseInt(c.id.slice(1), 10); if (i !== activeQ) { activeQ = i; refreshNav(); } }
});

/* help overlay */
var help = el('div', 'sd-help', 'sd-overlay'); help.style.display = 'none';
help.setAttribute('role', 'dialog'); help.setAttribute('aria-label', 'Keyboard shortcuts');
help.innerHTML = '<div class="sd-box"><h2>Keyboard shortcuts</h2><div class="sd-keys">' +
  '<kbd>A</kbd><span>to <kbd>D</kbd> (or <kbd>1</kbd>-<kbd>4</kbd>): choose an answer for the current question</span>' +
  '<kbd>N</kbd><span>next question (<kbd>P</kbd> previous)</span>' +
  '<kbd>F</kbd><span>flag or unflag the current question for review</span>' +
  '<kbd>U</kbd><span>jump to the next unanswered question</span>' +
  '<kbd>G</kbd><span>open or close the question navigator</span>' +
  '<kbd>&uarr; &darr;</kbd><span>move between answers when one is focused (Space/Enter selects)</span>' +
  '<kbd>Esc</kbd><span>close this window</span></div>' +
  '<div class="actions"><button class="sd-btn solid" type="button" id="sd-help-close">Got it</button></div></div>';
document.body.appendChild(help);
function showHelp(on) { help.style.display = on ? 'grid' : 'none'; if (on) $('sd-help-close').focus(); }
$('sd-help-btn').onclick = function () { showHelp(true); };
$('sd-help-close').onclick = function () { showHelp(false); };
help.addEventListener('click', function (e) { if (e.target === help) showHelp(false); });

/* ---------------- per-question controls ---------------- */
function fillChip(i) {
  var c = document.querySelector('[data-chip="' + i + '"]'); if (!c) return;
  var f = fieldOf(i);
  c.innerHTML = f && FIELD_META[f] ? '<span class="sd-field" style="--fc:' + FIELD_META[f].color + '">' + FIELD_META[f].name + '</span>' : '';
}

function syncRadios(i) {
  var card = $('q' + i); if (!card) return;
  var opts = card.querySelector('.options').children, sel = userAnswers[i], locked = checked || LOCKED[i];
  for (var k = 0; k < opts.length; k++) {
    opts[k].setAttribute('aria-checked', sel === k ? 'true' : 'false');
    opts[k].setAttribute('aria-disabled', locked ? 'true' : 'false');
    opts[k].tabIndex = locked ? -1 : ((sel === null ? k === 0 : sel === k) ? 0 : -1);
  }
}

function toggleFlag(i) {
  FLAGS[i] = FLAGS[i] ? 0 : 1;
  var card = $('q' + i), b = card.querySelector('.sd-flag');
  b.setAttribute('aria-pressed', FLAGS[i] ? 'true' : 'false');
  b.lastChild.textContent = FLAGS[i] ? 'Flagged' : 'Flag';
  card.classList.toggle('sd-flagged', !!FLAGS[i]);
  persist(); refreshNav();
  var rp = $('sd-results'); if (rp) updateResultCounts();
}

function choose(i, idx) {
  if (i === null || i === undefined || checked || LOCKED[i]) return false;
  var o = $('q' + i).querySelectorAll('.option')[idx]; if (!o) return false;
  o.click();
  try { o.focus({ preventScroll: true }); } catch (e) { o.focus(); }
  return true;
}

function optionKey(e, i, k) {
  if (checked || LOCKED[i]) return;
  var opts = $('q' + i).querySelector('.options').children, n = null;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); opts[k].click(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (k + 1) % opts.length;
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (k + opts.length - 1) % opts.length;
  if (n !== null) { e.preventDefault(); e.stopPropagation(); opts[n].click(); opts[n].focus(); }
}

function lock(i) {                                         // practice instant feedback
  if (userAnswers[i] === null || checked) return;
  LOCKED[i] = 1;
  var card = $('q' + i), opts = card.querySelectorAll('.option'), key = QUESTIONS[i][2], ua = userAnswers[i];
  opts.forEach(function (o) { o.classList.add('disabled'); });
  opts[key].classList.add('reveal-correct');
  var note = $('note' + i);
  var right = L[key] + '. ' + opts[key].children[1].textContent;
  if (ua === key) { card.classList.add('correct'); note.className = 'answer-note show right'; note.textContent = 'Correct - Answer: ' + right; }
  else { card.classList.add('wrong'); opts[ua].classList.add('reveal-wrong'); note.className = 'answer-note show wrong'; note.textContent = 'Incorrect - Correct answer: ' + right; }
  syncRadios(i);
}
function relock() {
  if (!PRACTICE || !PSTATE || !PSTATE.settings.instant || checked) return;
  for (var i = 0; i < N; i++) if (userAnswers[i] !== null) lock(i);
}

function enhance() {
  Array.prototype.forEach.call(cards(), function (card) {
    var i = parseInt(card.id.slice(1), 10);
    var head = card.querySelector('.q-head'), qt = card.querySelector('.q-text');
    qt.id = 'qt' + i;
    var fb = document.createElement('button');
    fb.type = 'button'; fb.className = 'sd-flag'; fb.title = 'Flag for review (F)';
    fb.setAttribute('aria-pressed', FLAGS[i] ? 'true' : 'false');
    fb.innerHTML = '&#9873; <span>' + (FLAGS[i] ? 'Flagged' : 'Flag') + '</span>';
    fb.onclick = function () { toggleFlag(i); };
    head.appendChild(fb);
    card.classList.toggle('sd-flagged', !!FLAGS[i]);
    var chips = document.createElement('div'); chips.className = 'sd-chips'; chips.setAttribute('data-chip', i);
    head.parentNode.insertBefore(chips, head.nextSibling);
    fillChip(i);
    var og = card.querySelector('.options');
    og.setAttribute('role', 'radiogroup'); og.setAttribute('aria-labelledby', 'qt' + i);
    Array.prototype.forEach.call(og.children, function (o, k) {
      o.setAttribute('role', 'radio');
      o.setAttribute('aria-label', 'Option ' + L[k] + ': ' + o.children[1].textContent);
      o.children[0].setAttribute('aria-hidden', 'true');
      o.addEventListener('click', function () {
        syncRadios(i);
        if (PRACTICE && PSTATE && PSTATE.settings.instant && !checked) lock(i);
      });
      o.addEventListener('keydown', function (e) { optionKey(e, i, k); });
    });
    syncRadios(i);
    var note = $('note' + i); if (note) note.setAttribute('aria-live', 'polite');
  });
  refreshNav();
  relock();
}

/* wrap the page's functions (they are looked up by name at call time, so this takes effect everywhere) */
var _render = window.render;
window.render = function (r) { _render(r); enhance(); };
var _updateStats = window.updateStats;
window.updateStats = function () { _updateStats.apply(this, arguments); refreshNav(); };

/* ---------------- keyboard shortcuts ---------------- */
document.addEventListener('keydown', function (e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  var t = e.target, tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
  if (e.key === 'Escape') { if (help.style.display !== 'none') { showHelp(false); } else { openNav(false); } return; }
  if (help.style.display !== 'none' || document.querySelector('.sd-overlay.blocking')) return;
  var k = e.key.length === 1 ? e.key.toLowerCase() : e.key, idx = 'abcd'.indexOf(k);
  if (idx >= 0 && e.key.length === 1) { if (choose(activeQ, idx)) e.preventDefault(); return; }
  if (k >= '1' && k <= '4') { if (choose(activeQ, parseInt(k, 10) - 1)) e.preventDefault(); return; }
  if (k === 'n' || k === 'j') { goTo(Math.min(N - 1, activeQ + 1)); e.preventDefault(); }
  else if (k === 'p' || k === 'k') { goTo(Math.max(0, activeQ - 1)); e.preventDefault(); }
  else if (k === 'f') { toggleFlag(activeQ); e.preventDefault(); }
  else if (k === 'u') { jump('unans'); e.preventDefault(); }
  else if (k === 'g') { openNav(); e.preventDefault(); }
  else if (k === '?') { showHelp(true); e.preventDefault(); }
});

/* ---------------- saving flags + progress ---------------- */
function persist() { if (PRACTICE) savePractice(); else if (typeof saveProgress === 'function') saveProgress(); }

if (!PRACTICE) {
  try {                                                    // restore flags saved next to the answers
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.flags) && saved.flags.length === N) FLAGS = saved.flags.map(function (v) { return v ? 1 : 0; });
  } catch (e) {}
  var _save = window.saveProgress;
  window.saveProgress = function () {
    _save.apply(this, arguments);
    if (checked) return;
    try {
      var d = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (d) { d.flags = FLAGS; localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
    } catch (e) {}
  };
}

/* ---------------- field tags ---------------- */
fetch('question-fields.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
  if (d && Array.isArray(d[SET]) && d[SET].length === N) {
    FIELDS = d[SET];
    for (var i = 0; i < N; i++) fillChip(i);
    if ($('sd-results')) buildResults();
  }
}).catch(function () {});

/* ---------------- review after submitting ---------------- */
var filter = 'all';
function setFilter(f) {
  filter = f;
  var rp = $('sd-results');
  if (rp) Array.prototype.forEach.call(rp.querySelectorAll('.sd-filter button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === f ? 'true' : 'false'); });
  Array.prototype.forEach.call(cards(), function (card) {
    var i = parseInt(card.id.slice(1), 10), show = true;
    if (f === 'wrong') show = statusOf(i) === 'wrong';
    else if (f === 'skip') show = statusOf(i) === 'skip';
    else if (f === 'ok') show = statusOf(i) === 'ok';
    else if (f === 'flag') show = !!FLAGS[i];
    card.classList.toggle('sd-hide', !show);
  });
}

function counts() {
  var c = { ok: 0, wrong: 0, skip: 0, flag: 0 };
  for (var i = 0; i < N; i++) { c[statusOf(i)]++; if (FLAGS[i]) c.flag++; }
  return c;
}
function updateResultCounts() {
  var c = counts();
  var map = { all: 'All (' + N + ')', wrong: 'Wrong only (' + c.wrong + ')', skip: 'Unanswered (' + c.skip + ')', flag: 'Flagged (' + c.flag + ')', ok: 'Correct (' + c.ok + ')' };
  Object.keys(map).forEach(function (k) { var b = document.querySelector('#sd-results [data-f="' + k + '"]'); if (b) b.textContent = map[k]; });
  updateSendButton();
}
function updateSendButton() {
  var b = $('sd-send'); if (!b) return;
  var c = counts(), n = c.wrong + ($('sd-inc-skip').checked ? c.skip : 0);
  b.textContent = 'Send ' + n + ' card' + (n === 1 ? '' : 's') + ' to flashcards';
  b.disabled = n === 0;
}

function removeResults() {
  var rp = $('sd-results'); if (rp) rp.remove();
  Array.prototype.forEach.call(cards(), function (c) { c.classList.remove('sd-hide'); });
  filter = 'all';
}

function buildResults() {
  var keepFilter = filter;
  var old = $('sd-results'); if (old) old.remove();
  var byField = {}, i;
  for (i = 0; i < N; i++) {
    var f = fieldOf(i) || '?', b = byField[f] || (byField[f] = { ok: 0, total: 0 });
    b.total++; if (statusOf(i) === 'ok') b.ok++;
  }
  var rows = Object.keys(byField).filter(function (k) { return FIELD_META[k]; }).sort(function (a, b) { return byField[a].ok / byField[a].total - byField[b].ok / byField[b].total; });
  var fieldHtml = rows.length ? rows.map(function (k, n) {
    var d = byField[k], pct = Math.round(d.ok / d.total * 100);
    return '<div class="sd-frow' + (n === 0 && rows.length > 1 ? ' weak' : '') + '" style="--fc:' + FIELD_META[k].color + '"><span>' + FIELD_META[k].name + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><span class="n">' + d.ok + ' / ' + d.total + ' (' + pct + '%)</span></div>';
  }).join('') : '<p style="color:var(--muted);font-size:.85rem">Field data is not available for this set yet.</p>';
  var rp = el('div', 'sd-results');
  rp.innerHTML = '<h3>Review your answers</h3>' +
    '<div class="sd-filter" role="group" aria-label="Filter questions">' +
    ['all', 'wrong', 'skip', 'flag', 'ok'].map(function (k) { return '<button type="button" data-f="' + k + '" aria-pressed="false"></button>'; }).join('') + '</div>' +
    '<h4>Score by field of science</h4>' + fieldHtml +
    '<h4>Study the ones you missed</h4>' +
    '<div class="sd-send"><button class="sd-btn solid" type="button" id="sd-send"></button><label><input type="checkbox" id="sd-inc-skip" checked> also include unanswered</label><span id="sd-send-msg" role="status"></span></div>';
  $('score-banner').insertAdjacentElement('afterend', rp);
  rp.querySelector('.sd-filter').onclick = function (e) { var b = e.target.closest('button'); if (b) { setFilter(b.getAttribute('data-f')); } };
  $('sd-inc-skip').onchange = updateSendButton;
  $('sd-send').onclick = sendWrong;
  updateResultCounts();
  for (i = 0; i < N; i++) syncRadios(i);
  refreshNav();
  setFilter(keepFilter);
}

function sendWrong() {
  var inc = $('sd-inc-skip').checked, list = [];
  for (var i = 0; i < N; i++) { var s = statusOf(i); if (s === 'wrong' || (inc && s === 'skip')) list.push(DISP[i]); }
  var msg = $('sd-send-msg'), btn = $('sd-send');
  if (!list.length) return;
  btn.disabled = true; msg.textContent = 'Sending...';
  sendToFlashcards(list).then(function () {
    msg.innerHTML = 'Done. ' + list.length + ' card' + (list.length === 1 ? ' is' : 's are') + ' due now in your flashcards. <a href="flashcards.html?set=' + encodeURIComponent(SET_FILE) + '" target="_top">Open flashcards</a>';
  }).catch(function () { msg.textContent = 'Could not send. Please try again.'; btn.disabled = false; });
}

function flashToday() {
  var n = new Date(), local = n.getTime() - n.getTimezoneOffset() * 60000;
  return Math.floor((local - 4 * 3600000) / 86400000);
}
function freshFlashState() {
  var cards = []; for (var i = 0; i < N; i++) cards.push({ s: 0, step: 0, due: 0, ivl: 0, ease: 2.5, lapses: 0, reps: 0, t: 0 });
  return { cards: cards, day: flashToday(), newToday: 0, newLimit: 20, saved: Date.now() };
}
function validFlash(s) { return s && Array.isArray(s.cards) && s.cards.length === N; }

// Puts the chosen cards back into the flashcard deck as "due now" (same effect as rating them Very Hard).
function sendToFlashcards(list) {
  var u = uid(), oldKey = 'sd_anki_' + SET_FILE, key = u ? 'sd_anki_' + u + '_' + SET_FILE : oldKey;
  var st = null;
  try { st = JSON.parse(localStorage.getItem(key)); } catch (e) {}
  if (!validFlash(st) && u) { try { st = JSON.parse(localStorage.getItem(oldKey)); } catch (e) {} }
  var p = Promise.resolve(validFlash(st) ? st : null);
  if (!validFlash(st) && token()) {
    p = fetch('/api/sync/' + SET, { headers: hdr() }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.state ? d.state : null; }).catch(function () { return null; });
  }
  return p.then(function (s) {
    if (!validFlash(s)) s = freshFlashState();
    var now = Date.now();
    list.forEach(function (ci) {
      var c = s.cards[ci];
      if (c.s === 2) { c.lapses = (c.lapses || 0) + 1; c.ease = Math.max(1.3, (c.ease || 2.5) - 0.2); c.ivl = 1; c.s = 3; }
      else c.s = 1;
      c.step = 0; c.due = now; c.t = now;
    });
    s.saved = now;
    try { localStorage.setItem(key, JSON.stringify(s)); } catch (e) {}
    if (!token()) return;
    return fetch('/api/sync/' + SET, { method: 'PUT', headers: hdr(), body: JSON.stringify({ state: s }) }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
    });
  });
}

/* results appear when the page shows the score banner, and disappear when it is hidden again (reset) */
var banner = $('score-banner');
new MutationObserver(function () {
  if (banner.style.display === 'block') { if (!$('sd-results')) buildResults(); }
  else if (!PRACTICE) {
    if (FLAGS.some(function (v) { return v; }) || $('sd-results')) {
      FLAGS = new Array(N).fill(0); LOCKED = new Array(N).fill(0); removeResults(); window.render(getRange());
    }
  }
}).observe(banner, { attributes: true, attributeFilter: ['style'] });

/* ---------------- practice mode ---------------- */
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
// Answer choices that refer to each other ("All of the above", "I and II") must stay in order.
function shuffleable(opts) {
  return !opts.some(function (o) {
    var t = String(o).trim();
    return /^(all|none|neither|both)\b/i.test(t) || /\b(above|choices?|these)\b/i.test(t) || /^(I{1,3}|IV)\b(\s*(,|and|only|&)|\s*$)/.test(t) || /\b(I{1,3}|IV)\s+(and|only)\b/.test(t);
  });
}
function makeState(settings) {
  var order = []; for (var i = 0; i < N; i++) order.push(i);
  if (settings.sq) shuffle(order);
  var perm = order.map(function (ci) { var p = [0, 1, 2, 3]; if (settings.so && shuffleable(CANON[ci][1])) shuffle(p); return p; });
  return { v: 1, order: order, perm: perm, answers: new Array(N).fill(null), flags: new Array(N).fill(0), settings: settings, done: false, score: null, saved: Date.now() };
}
function validP(s) {
  return s && Array.isArray(s.order) && s.order.length === N && Array.isArray(s.perm) && s.perm.length === N &&
    Array.isArray(s.answers) && s.answers.length === N && s.settings && typeof s.settings === 'object';
}
function applyState(s) {
  PSTATE = s;
  var entries = s.order.map(function (ci, k) {
    var q = CANON[ci], p = s.perm[k];
    return [q[0], p.map(function (j) { return q[1][j]; }), p.indexOf(q[2])];
  });
  QUESTIONS.length = 0;
  entries.forEach(function (e) { QUESTIONS.push(e); });
  DISP = s.order.slice();
  userAnswers = s.answers.slice();
  FLAGS = (s.flags || []).length === N ? s.flags.map(function (v) { return v ? 1 : 0; }) : new Array(N).fill(0);
  LOCKED = new Array(N).fill(0);
  window.render(getRange());
}

var PKEY = 'sd_practice_' + (uid() || 'guest') + '_' + SET;
var pDirty = false, pTimer = null;
function setSync(txt, cls) {
  var p = $('sd-sync');
  if (!uid()) { p.style.display = 'none'; return; }
  p.style.display = ''; p.className = 'sd-pill ' + (cls || ''); p.textContent = txt;
}
function savePractice() {
  if (!PSTATE) return;
  PSTATE.answers = userAnswers.slice(); PSTATE.flags = FLAGS.slice(); PSTATE.saved = Date.now();
  try { localStorage.setItem(PKEY, JSON.stringify(PSTATE)); } catch (e) {}
  if (!uid()) return;
  pDirty = true; clearTimeout(pTimer); pTimer = setTimeout(function () { pushPractice(); }, 2500);
}
function pushPractice(keep) {
  if (!PSTATE || !uid()) return Promise.resolve();
  return fetch('/api/practice/' + SET, { method: 'PUT', keepalive: !!keep, headers: hdr(), body: JSON.stringify({ state: PSTATE }) })
    .then(function (r) {
      if (r.status === 401) { setSync('Log in again to sync', 'warn'); return; }
      if (!r.ok) throw new Error('http ' + r.status);
      pDirty = false; setSync('Saved to your account', 'ok');
    }).catch(function () { pDirty = true; setSync('Offline - saved on this device', 'warn'); });
}
function pullPractice() {
  if (!uid()) return Promise.resolve(null);
  var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
  return fetch('/api/practice/' + SET, { headers: hdr(), signal: ctl ? ctl.signal : undefined })
    .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then(function (d) { clearTimeout(to); return d && d.state && validP(d.state) ? d.state : null; })
    .catch(function () { clearTimeout(to); setSync('Offline - using this device', 'warn'); return null; });
}

function programmaticCheck() {                           // re-shows the results of a finished practice
  if (!nameInput.value.trim()) nameInput.value = 'Practice';
  var oc = window.confirm, oa = window.alert;
  window.confirm = function () { return true; }; window.alert = function () {};
  try { window.checkAnswers(); } finally { window.confirm = oc; window.alert = oa; }
}

function initPractice() {
  document.querySelector('.name-card').style.display = 'none';
  var rn = $('resumeNotice'); if (rn) rn.style.display = 'none';
  nameInput.value = nameInput.value || 'Practice';
  $('resetBtn').textContent = 'New practice';
  userAnswers = new Array(N).fill(null);                  // ignore any exam progress the page restored

  window.saveProgress = function () { savePractice(); };
  window.clearProgress = function () {
    try { localStorage.removeItem(PKEY); } catch (e) {}
    PSTATE = null;
    var p = token() ? fetch('/api/practice/' + SET, { method: 'DELETE', headers: hdr(), keepalive: true }).catch(function () {}) : Promise.resolve();
    Promise.race([p, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () { location.reload(); });
  };
  window.submitScore = function (name, score) {
    submitted = true;
    var st = $('submitStatus'); st.className = 'pending';
    st.textContent = 'Practice finished - this score is not recorded as an exam. Use "New practice" to start again.';
    if (PSTATE) { PSTATE.done = true; PSTATE.score = score; savePractice(); }
  };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && pDirty) pushPractice(true); });
  window.addEventListener('online', function () { if (pDirty) pushPractice(); });
  setInterval(function () { if (pDirty) pushPractice(); }, 30000);

  var ov = el('div', 'sd-practice', 'sd-overlay blocking');
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Practice mode');
  document.body.appendChild(ov);

  function close() { ov.remove(); }
  function begin(state, review) {
    close(); applyState(state);
    try { localStorage.setItem(PKEY, JSON.stringify(state)); } catch (e) {}
    if (review) programmaticCheck();
    else savePractice();
    window.scrollTo(0, 0);
  }
  function settingsView(prev, back) {
    var s = prev || { sq: false, so: false, instant: true };
    ov.innerHTML = '<div class="sd-box"><h2>Practice mode - Set ' + SET + '</h2>' +
      '<p>Self-paced, no timer. Your progress is saved automatically' + (uid() ? ' to your account, so you can continue on any device.' : ' on this device. Log in on the home page to save it to your account.') + ' Practice does not earn XP.</p>' +
      '<label class="chk"><input type="checkbox" id="sd-o-sq"' + (s.sq ? ' checked' : '') + '><span>Shuffle question order</span></label>' +
      '<label class="chk"><input type="checkbox" id="sd-o-so"' + (s.so ? ' checked' : '') + '><span>Shuffle answer choices<small>Questions whose choices refer to each other ("All of the above", "I and II") keep their order.</small></span></label>' +
      '<label class="chk"><input type="checkbox" id="sd-o-in"' + (s.instant ? ' checked' : '') + '><span>Instant feedback after each answer<small>Shows right or wrong straight away and locks that question.</small></span></label>' +
      '<div class="actions"><button class="sd-btn solid" type="button" id="sd-o-go">Start practice</button>' + (back ? '<button class="sd-btn" type="button" id="sd-o-back">Back</button>' : '') + '<a class="sd-btn" href="index.html#practice" style="text-decoration:none">Home</a></div></div>';
    $('sd-o-go').onclick = function () { begin(makeState({ sq: $('sd-o-sq').checked, so: $('sd-o-so').checked, instant: $('sd-o-in').checked }), false); };
    if (back) $('sd-o-back').onclick = back;
    $('sd-o-go').focus();
  }
  function resumeView(best) {
    var n = best.answers.filter(function (a) { return a !== null; }).length, when = new Date(best.saved).toLocaleString();
    ov.innerHTML = '<div class="sd-box"><h2>Practice mode - Set ' + SET + '</h2>' +
      (best.done ? '<p>Your last practice is finished: <b>' + best.score + ' / ' + N + '</b> correct. Saved ' + esc(when) + '.</p>' : '<p>You have a saved practice: <b>' + n + ' of ' + N + '</b> answered. Saved ' + esc(when) + '.</p>') +
      '<div class="actions">' + (best.done ? '<button class="sd-btn solid" type="button" id="sd-o-cont">Review results</button>' : '<button class="sd-btn solid" type="button" id="sd-o-cont">Continue practice</button>') +
      '<button class="sd-btn" type="button" id="sd-o-new">Start a new practice</button></div></div>';
    $('sd-o-cont').onclick = function () { begin(best, !!best.done); };
    $('sd-o-new').onclick = function () { settingsView(best.settings, function () { resumeView(best); }); };
    $('sd-o-cont').focus();
  }

  ov.innerHTML = '<div class="sd-box"><h2>Practice mode - Set ' + SET + '</h2><p>Loading your saved practice...</p></div>';
  var local = null;
  try { local = JSON.parse(localStorage.getItem(PKEY)); } catch (e) {}
  if (!validP(local)) local = null;
  pullPractice().then(function (remote) {
    var best = local;
    if (remote && (!best || (remote.saved || 0) > (best.saved || 0))) best = remote;
    if (best) { try { localStorage.setItem(PKEY, JSON.stringify(best)); } catch (e) {} if (uid()) setSync('Saved to your account', 'ok'); resumeView(best); }
    else { if (uid()) setSync('Saved to your account', 'ok'); settingsView(null, null); }
  });
}
/* polish: shared stylesheet + consistent text */
if (!document.querySelector('link[href$="drill.css"]')) {
  var pl = document.createElement('link'); pl.rel = 'stylesheet'; pl.href = 'drill.css'; document.head.appendChild(pl);
}
document.title = 'General Science Drill - Set ' + SET;           // Set A's title was missing "Set A"
nameInput.placeholder = 'e.g. LAST NAME, First Name, Middle Initial';   // Sets E and F used ALL CAPS
document.addEventListener('click', function (e) {                // tap outside the sheet to close it
  if (nav.classList.contains('open') && !nav.contains(e.target) && !$('sd-nav-btn').contains(e.target)) openNav(false);
});
}

/* ---------------- start ---------------- */
enhance();
if (PRACTICE) initPractice();
})();
