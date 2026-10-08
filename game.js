/* Science Drills - shared game layer.
   Everything (XP, level, achievements, quests) is DERIVED from the rows returned by /api/activity,
   so no database changes are needed and the numbers can never drift out of sync. */
(function () {
'use strict';
var SD = window.SD = {};
SD.SETS = ['A', 'B', 'C', 'D', 'E', 'F'];
SD.COLORS = { A: '#28e0c5', B: '#5aa9ff', C: '#ffc857', D: '#ff6b7a', E: '#a78bfa', F: '#34d399' };
SD.TIER = {
  bronze: { xp: 25, name: 'Bronze', color: '#d08b4d' },
  silver: { xp: 50, name: 'Silver', color: '#c3cddb' },
  gold:   { xp: 100, name: 'Gold', color: '#ffc857' },
  epic:   { xp: 250, name: 'Epic', color: '#a78bfa' }
};

/* ---------- auth / data ---------- */
SD.token = function () { try { return localStorage.getItem('sd_token'); } catch (e) { return null; } };
SD.uid = function () {
  var t = SD.token(); if (!t) return null;
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id; } catch (e) { return null; }
};
// Resolves rows, or null when logged out / session expired. Rejects on network errors.
SD.fetchRows = function () {
  var t = SD.token(); if (!t) return Promise.resolve(null);
  return fetch('/api/activity', { headers: { Authorization: 'Bearer ' + t } }).then(function (r) {
    if (r.status === 401) { try { localStorage.removeItem('sd_token'); } catch (e) {} return null; }
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  });
};

/* ---------- helpers ---------- */
function pad(n) { return (n < 10 ? '0' : '') + n; }
function dkey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dnum(k) { var p = k.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
function pct(r) { return r.total ? r.score / r.total * 100 : 0; }
function dayOf(r) { return r.day ? String(r.day).slice(0, 10) : dkey(new Date(r.created_at)); }
function when(r) { return new Date(r.updated_at || r.created_at); }
SD.today = function () { return dkey(new Date()); };
SD.dkey = dkey;

/* ---------- XP and levels ---------- */
// exam: 5 XP per correct answer + 30 for finishing + accuracy bonus.  flashcards: 2 XP per review + 10 per card learned.
SD.XP_RULES = { examCorrect: 5, examFinish: 30, review: 2, cardLearned: 10 };
function examXp(r) {
  var p = pct(r);
  return r.score * 5 + 30 + (p >= 90 ? 100 : p >= 75 ? 50 : p >= 60 ? 20 : 0);
}
function thr(L) { return Math.round(60 * Math.pow(L - 1, 1.7)); }
var RANKS = [[1, 'Curious Cadet'], [3, 'Lab Intern'], [5, 'Field Researcher'], [8, 'Junior Scientist'],
             [12, 'Senior Scientist'], [17, 'Principal Investigator'], [23, 'Nobel Candidate'], [30, 'Science Legend']];
SD.levelInfo = function (xp) {
  var L = 1; while (xp >= thr(L + 1)) L++;
  var base = thr(L), next = thr(L + 1), title = RANKS[0][1];
  RANKS.forEach(function (r) { if (L >= r[0]) title = r[1]; });
  return { level: L, xp: xp, into: xp - base, need: next - base, pct: Math.min(100, (xp - base) / (next - base) * 100), title: title, nextAt: next };
};

/* ---------- achievements ---------- */
function A(id, icon, name, desc, tier, fn, unit) { return { id: id, icon: icon, name: name, desc: desc, tier: tier, fn: fn, unit: unit || '' }; }
SD.ACHIEVEMENTS = [
  A('first', '🚀', 'First Steps', 'Finish a study session while logged in.', 'bronze', function (s) { return [s.days.length ? 1 : 0, 1]; }),
  A('rookie', '📝', 'Exam Rookie', 'Finish your first timed exam.', 'bronze', function (s) { return [s.examCount, 1]; }),
  A('exam5', '📚', 'Regular Tester', 'Finish 5 timed exams.', 'silver', function (s) { return [s.examCount, 5]; }),
  A('exam15', '🏛️', 'Exam Veteran', 'Finish 15 timed exams.', 'gold', function (s) { return [s.examCount, 15]; }),
  A('pass', '✅', 'Passing Grade', 'Score 75% or higher on an exam.', 'silver', function (s) { return [s.bestPct, 75]; }, '%'),
  A('ace', '🏅', 'Ace', 'Score 90% or higher on an exam.', 'gold', function (s) { return [s.bestPct, 90]; }, '%'),
  A('perfect', '💎', 'Flawless', 'Score 100% on an exam.', 'epic', function (s) { return [s.bestPct, 100]; }, '%'),
  A('nonblank', '🧩', 'No Blanks', 'Finish an exam without leaving any item unanswered.', 'silver', function (s) { return [s.clean ? 1 : 0, 1]; }),
  A('brain', '🧠', 'Brainiac', 'Answer 500 exam questions correctly (total).', 'gold', function (s) { return [s.correct, 500]; }),
  A('speed', '⚡', 'Speed Runner', 'Finish an exam in under 90 minutes with 70%+.', 'silver', function (s) { return [s.speedRun ? 1 : 0, 1]; }),
  A('improver', '📈', 'Rising Star', 'Beat your previous score on the same set by 10+ points.', 'silver', function (s) { return [s.improved ? 1 : 0, 1]; }),
  A('triple', '🔱', 'Triple Threat', 'Reach 85%+ best score on 3 different sets.', 'gold', function (s) { return [s.sets85, 3]; }),
  A('cards25', '🃏', 'Card Collector', 'Learn 25 flashcards.', 'bronze', function (s) { return [s.learned, 25]; }),
  A('cards150', '🗂️', 'Deck Cleared', 'Learn 150 flashcards.', 'silver', function (s) { return [s.learned, 150]; }),
  A('cards450', '🏰', 'Memory Palace', 'Learn 450 flashcards.', 'gold', function (s) { return [s.learned, 450]; }),
  A('cards900', '🌌', 'Walking Encyclopedia', 'Learn all 900 flashcards.', 'epic', function (s) { return [s.learned, 900]; }),
  A('rev100', '🔥', 'Warming Up', 'Complete 100 flashcard reviews.', 'bronze', function (s) { return [s.reviews, 100]; }),
  A('rev500', '⚙️', 'Review Machine', 'Complete 500 flashcard reviews.', 'silver', function (s) { return [s.reviews, 500]; }),
  A('rev2000', '🛠️', 'Relentless', 'Complete 2,000 flashcard reviews.', 'gold', function (s) { return [s.reviews, 2000]; }),
  A('easy', '😎', 'Easy Does It', 'Rate 70%+ of 200+ reviews as Easy.', 'silver', function (s) { return [s.reviews >= 200 ? Math.round(s.goodPct) : 0, 70]; }, '%'),
  A('streak3', '📅', 'On a Roll', 'Study 3 days in a row.', 'bronze', function (s) { return [s.bestStreak, 3]; }, ' days'),
  A('streak7', '🗓️', 'Week Warrior', 'Study 7 days in a row.', 'silver', function (s) { return [s.bestStreak, 7]; }, ' days'),
  A('streak30', '🌋', 'Unstoppable', 'Study 30 days in a row.', 'epic', function (s) { return [s.bestStreak, 30]; }, ' days'),
  A('explorer', '🧭', 'Set Explorer', 'Study from all 6 sets.', 'gold', function (s) { return [s.setsTouched, 6]; }),
  A('night', '🦉', 'Night Owl', 'Study between 10 PM and 4 AM.', 'bronze', function (s) { return [s.night ? 1 : 0, 1]; }),
  A('early', '🌅', 'Early Bird', 'Study between 5 AM and 8 AM.', 'bronze', function (s) { return [s.early ? 1 : 0, 1]; })
];

/* ---------- compute everything from raw rows ---------- */
SD.compute = function (rowsIn) {
  var rows = (rowsIn || []).slice().sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
  var s = { rows: rows, exams: [], xpByDay: {}, dayAct: {}, flashDaily: {}, perSet: {} };
  SD.SETS.forEach(function (L) { s.perSet[L] = { attempts: 0, avg: 0, best: 0, learned: 0, touched: false, _sum: 0 }; });
  var dayset = {}, learnedMax = {}, bySet = {};
  var baseExam = 0, baseFlash = 0, reviews = 0, ag = 0, hd = 0, gd = 0, correct = 0, night = false, early = false;
  var speedRun = false, clean = false;

  rows.forEach(function (r) {
    var L = r.set_letter, day = dayOf(r), hr = when(r).getHours();
    dayset[day] = 1;
    if (s.perSet[L]) s.perSet[L].touched = true;
    if (hr >= 22 || hr < 4) night = true;
    if (hr >= 5 && hr < 8) early = true;
    var da = s.dayAct[day] || (s.dayAct[day] = { reviews: 0, exams: 0, bestExam: 0 });
    if (r.mode !== 'exam') return;
    var p = pct(r), x = examXp(r);
    var e = { set: L, pct: p, score: r.score, total: r.total, unanswered: r.unanswered || 0,
              dur: r.duration_sec ? r.duration_sec / 60 : null, day: day, date: when(r), xp: x };
    s.exams.push(e);
    baseExam += x; correct += r.score;
    s.xpByDay[day] = (s.xpByDay[day] || 0) + x;
    da.exams++; da.bestExam = Math.max(da.bestExam, p);
    (bySet[L] = bySet[L] || []).push(e);
    var ps = s.perSet[L];
    if (ps) { ps.attempts++; ps._sum += p; ps.best = Math.max(ps.best, p); }
    if (e.dur !== null && e.dur < 90 && p >= 70) speedRun = true;
    if (e.unanswered === 0 && e.total >= 100) clean = true;
  });

  // flashcards: one row per set/day. "learned" only ever counts up so XP never goes backwards.
  rows.filter(function (r) { return r.mode === 'flashcards'; })
    .sort(function (a, b) { var da = dayOf(a), db = dayOf(b); return da < db ? -1 : da > db ? 1 : new Date(a.created_at) - new Date(b.created_at); })
    .forEach(function (r) {
      var L = r.set_letter, day = dayOf(r), prev = learnedMax[L] || 0;
      var delta = Math.max(0, r.score - prev);
      learnedMax[L] = Math.max(prev, r.score);
      var x = r.reviews * 2 + delta * 10;
      baseFlash += x; s.xpByDay[day] = (s.xpByDay[day] || 0) + x;
      reviews += r.reviews; ag += r.again; hd += r.hard; gd += r.good;
      s.dayAct[day].reviews += r.reviews;
      var fd = s.flashDaily[day] || (s.flashDaily[day] = { again: 0, hard: 0, good: 0 });
      fd.again += r.again; fd.hard += r.hard; fd.good += r.good;
    });

  var learned = 0, sets85 = 0, touched = 0, improved = false;
  SD.SETS.forEach(function (L) {
    var ps = s.perSet[L];
    ps.learned = learnedMax[L] || 0; learned += ps.learned;
    ps.avg = ps.attempts ? ps._sum / ps.attempts : 0;
    if (ps.best >= 85) sets85++;
    if (ps.touched) touched++;
    var list = bySet[L] || [];
    for (var i = 1; i < list.length; i++) if (list[i].pct - list[i - 1].pct >= 10) improved = true;
  });

  // streaks
  var days = Object.keys(dayset).sort(), best = 0, run = 0, prev = null, have = {};
  days.forEach(function (d) { var n = dnum(d); have[n] = 1; run = (prev !== null && n - prev === 1) ? run + 1 : 1; prev = n; best = Math.max(best, run); });
  var cur = 0, t = dnum(SD.today()), n = have[t] ? t : t - 1;
  while (have[n]) { cur++; n--; }

  var pcts = s.exams.map(function (e) { return e.pct; });
  var rv = ag + hd + gd;
  s.days = days; s.streak = cur; s.bestStreak = best;
  s.examCount = s.exams.length;
  s.bestPct = pcts.length ? Math.max.apply(null, pcts) : 0;
  s.avgPct = pcts.length ? pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length : 0;
  s.correct = correct; s.learned = learned; s.reviews = reviews;
  s.again = ag; s.hard = hd; s.good = gd; s.goodPct = rv ? gd / rv * 100 : 0;
  s.setsTouched = touched; s.sets85 = sets85; s.improved = improved;
  s.night = night; s.early = early; s.speedRun = speedRun; s.clean = clean;
  s.unansweredTotal = s.exams.reduce(function (a, e) { return a + e.unanswered; }, 0);
  s.questionsTotal = s.exams.reduce(function (a, e) { return a + e.total; }, 0);

  // XP timeline
  var cum = 0;
  s.timeline = Object.keys(s.xpByDay).sort().map(function (d) { cum += s.xpByDay[d]; return { day: d, xp: s.xpByDay[d], cum: cum }; });

  // achievements
  s.achievements = SD.ACHIEVEMENTS.map(function (d) {
    var r = d.fn(s), c = r[0], g = r[1];
    return { id: d.id, icon: d.icon, name: d.name, desc: d.desc, tier: d.tier, unit: d.unit,
             cur: c, goal: g, done: c >= g, ratio: Math.min(1, c / g), xp: SD.TIER[d.tier].xp };
  });
  s.unlocked = s.achievements.filter(function (a) { return a.done; }).length;
  s.nextUp = s.achievements.filter(function (a) { return !a.done; }).sort(function (a, b) { return b.ratio - a.ratio; })[0] || null;
  s.baseXp = baseExam + baseFlash;
  s.bonusXp = s.achievements.reduce(function (a, d) { return a + (d.done ? d.xp : 0); }, 0);
  s.xp = s.baseXp + s.bonusXp;
  s.lvl = SD.levelInfo(s.xp);

  // daily quests
  var td = s.dayAct[SD.today()] || { reviews: 0, exams: 0, bestExam: 0 };
  s.quests = [
    { icon: '🃏', label: 'Review 20 flashcards', cur: td.reviews, goal: 20 },
    { icon: '⏱️', label: 'Finish a timed exam', cur: td.exams, goal: 1 },
    { icon: '🎯', label: 'Score 75%+ on an exam', cur: Math.floor(td.bestExam), goal: 75, unit: '%' }
  ].map(function (q) { q.done = q.cur >= q.goal; q.ratio = Math.min(1, q.cur / q.goal); return q; });
  return s;
};

/* ---------- toasts, level-up, confetti ---------- */
function box() {
  var b = document.getElementById('sd-toasts');
  if (!b) { b = document.createElement('div'); b.id = 'sd-toasts'; document.body.appendChild(b); }
  return b;
}
SD.toast = function (o) {
  var el = document.createElement('div');
  el.className = 'sd-toast ' + (o.kind || '');
  el.innerHTML = '<div class="ic"></div><div class="tx"><b></b><span></span></div>';
  el.querySelector('.ic').textContent = o.icon || '⭐';
  el.querySelector('b').textContent = o.title || '';
  el.querySelector('span').textContent = o.text || '';
  box().appendChild(el);
  requestAnimationFrame(function () { el.classList.add('in'); });
  setTimeout(function () { el.classList.remove('in'); setTimeout(function () { el.remove(); }, 400); }, o.ms || 5200);
};
SD.confetti = function () {
  var c = document.createElement('canvas'); c.className = 'sd-confetti';
  c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
  var g = c.getContext('2d'), cols = ['#28e0c5', '#5aa9ff', '#ffc857', '#ff6b7a', '#a78bfa'], P = [];
  for (var i = 0; i < 140; i++) P.push({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, vx: Math.random() * 4 - 2, vy: 2 + Math.random() * 4,
    s: 5 + Math.random() * 6, r: Math.random() * 6, vr: Math.random() * .3 - .15, c: cols[i % cols.length] });
  var t0 = performance.now();
  (function f(t) {
    g.clearRect(0, 0, c.width, c.height);
    P.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); g.restore(); });
    if (t - t0 < 3200) requestAnimationFrame(f); else c.remove();
  })(t0);
};
SD.levelUp = function (lvl) {
  var bg = document.createElement('div'); bg.className = 'sd-levelup';
  bg.innerHTML = '<div class="box"><div class="kicker">LEVEL UP!</div><div class="big"></div><div class="rk"></div><p>Keep going. Every drill counts.</p><button class="btn">Continue</button></div>';
  bg.querySelector('.big').textContent = lvl.level;
  bg.querySelector('.rk').textContent = lvl.title;
  bg.querySelector('button').onclick = function () { bg.remove(); };
  document.body.appendChild(bg); SD.confetti();
};

/* Fetch latest rows, compare with what this user has already seen, announce anything new.
   First run per user just stores a baseline (so existing history does not spam toasts). */
SD.check = function (o) {
  o = o || {};
  return SD.fetchRows().then(function (rows) {
    if (!rows) return null;
    var s = SD.compute(rows), uid = SD.uid();
    if (!uid) return s;
    var key = 'sd_seen_' + uid, seen = null;
    try { seen = JSON.parse(localStorage.getItem(key)); } catch (e) {}
    var now = { level: s.lvl.level, xp: s.xp, ach: s.achievements.filter(function (a) { return a.done; }).map(function (a) { return a.id; }) };
    if (seen && seen.ach) {
      var gained = s.xp - seen.xp, d = 0;
      if (o.xp && gained > 0) SD.toast({ icon: '✨', title: '+' + gained + ' XP', text: 'Progress saved to your profile.', kind: 'xp', ms: 3500 });
      s.achievements.filter(function (a) { return a.done && seen.ach.indexOf(a.id) < 0; }).forEach(function (a) {
        setTimeout(function () { SD.toast({ icon: a.icon, title: 'Achievement unlocked: ' + a.name, text: a.desc + '  +' + a.xp + ' XP', kind: 'ach ' + a.tier, ms: 6500 }); }, 600 + (d++) * 900);
      });
      if (s.lvl.level > seen.level) setTimeout(function () { SD.levelUp(s.lvl); }, 500);
    }
    try { localStorage.setItem(key, JSON.stringify(now)); } catch (e) {}
    return s;
  }).catch(function () { return null; });
};
})();
