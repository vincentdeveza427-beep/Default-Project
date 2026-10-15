// social.js - profile pictures + daily/weekly leaderboard.
// Mounted from server.js by apply-leaderboard-patch.js:
//     require('./social.js')({ app, auth, supabase, listAllUsers, listAllActivity, fetchAllRows, effectiveRole, rateLimit, baseLimit, limitMsg });
//
// Endpoints
//   GET  /api/profile            -> { avatar, hide }                 (logged in)
//   PUT  /api/profile            -> save avatar and/or hide flag     (logged in)
//   GET  /api/avatar/:id         -> the uploaded photo as image/jpeg (public, cached; used by <img>)
//   GET  /api/leaderboard?period=day|week&today=YYYY-MM-DD           (logged in)
//
// Leaderboard XP uses the same formulas as game.js (exam: 5/correct + 30 + accuracy bonus,
// flashcards: 2/review + 10 per newly learned card). Badge bonuses and practice mode are not counted.
// Teacher (admin) accounts and students who tick "hide me" are not listed.

const fs = require('fs');
const path = require('path');

module.exports = function mountSocial(d) {
  const { app, auth, supabase, listAllUsers, listAllActivity, fetchAllRows, effectiveRole, rateLimit, baseLimit, limitMsg } = d;

  const perUser = (req) => 'u:' + (req.user && req.user.id);
  const profileLimiter = rateLimit({ ...baseLimit, windowMs: 60 * 1000, limit: 30, keyGenerator: perUser,
    message: limitMsg('Too many profile changes. Please wait a moment.') });
  const boardLimiter = rateLimit({ ...baseLimit, windowMs: 60 * 1000, limit: 60, keyGenerator: perUser,
    message: limitMsg('Refreshing too fast. Please wait a moment.') });

  // ---------- storage (Supabase table "profiles", or profiles.json locally) ----------
  const PROFILES_FILE = path.join(__dirname, 'profiles.json');
  function loadProfiles() { try { return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')); } catch { return {}; } }

  async function getProfile(userId) {
    if (supabase) {
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).limit(1);
      if (error) throw new Error(error.message);
      return data[0] || null;
    }
    return loadProfiles()[userId] || null;
  }
  // The leaderboard never needs the photo bytes, so they are left out of this list.
  async function listProfiles() {
    if (supabase) {
      return fetchAllRows((a, b) => supabase.from('profiles').select('user_id,kind,emoji,color,hide,updated_at').order('user_id').range(a, b));
    }
    return Object.entries(loadProfiles()).map(([user_id, p]) => ({ user_id, kind: p.kind, emoji: p.emoji, color: p.color, hide: p.hide, updated_at: p.updated_at }));
  }
  async function putProfile(userId, p) {
    const row = { user_id: userId, kind: p.kind, emoji: p.emoji, color: p.color, img: p.img, hide: !!p.hide, updated_at: new Date().toISOString() };
    if (supabase) {
      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      return;
    }
    const all = loadProfiles();
    all[userId] = row;
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(all));
  }

  // ---------- validation ----------
  // false = invalid, otherwise the cleaned fields to store (kind null = back to the default avatar).
  function cleanAvatar(a) {
    if (a === null || a === undefined) return { kind: null, emoji: null, color: null, img: null };
    if (typeof a !== 'object') return false;
    if (a.type === 'emoji') {
      const e = String(a.emoji || ''), c = String(a.color || '');
      if (!e || e.length > 8 || /[<>&"'\\\s]/.test(e) || !/^#[0-9a-fA-F]{6}$/.test(c)) return false;
      return { kind: 'emoji', emoji: e, color: c, img: null };
    }
    if (a.type === 'img') {
      const data = String(a.data || '');
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
      // JPEG only (the browser re-encodes every upload), small, and it must really start like a JPEG.
      if (!m || m[1].length > 36000 || !m[1].startsWith('/9j/')) return false;
      return { kind: 'img', emoji: null, color: null, img: data };
    }
    return false;
  }
  function avatarOut(id, p) {
    if (!p || !p.kind) return null;
    if (p.kind === 'emoji') return { kind: 'emoji', emoji: p.emoji, color: p.color };
    const v = String(p.updated_at || '').replace(/\D/g, '') || '0';
    return { kind: 'img', url: '/api/avatar/' + encodeURIComponent(id) + '?v=' + v };
  }

  // ---------- profile routes ----------
  app.get('/api/profile', auth, profileLimiter, async (req, res) => {
    try {
      const p = await getProfile(req.user.id);
      res.json({ avatar: avatarOut(req.user.id, p), hide: !!(p && p.hide) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error: ' + e.message });
    }
  });

  app.put('/api/profile', auth, profileLimiter, async (req, res) => {
    try {
      const b = req.body || {};
      const cur = (await getProfile(req.user.id)) || {};
      let next = { kind: cur.kind || null, emoji: cur.emoji || null, color: cur.color || null, img: cur.img || null, hide: !!cur.hide };
      if ('avatar' in b) {
        const a = cleanAvatar(b.avatar);
        if (a === false) return res.status(400).json({ error: 'That avatar is not valid. Try a smaller photo.' });
        next = { ...a, hide: next.hide };
      }
      if (typeof b.hide === 'boolean') next.hide = b.hide;
      await putProfile(req.user.id, next);
      const saved = await getProfile(req.user.id);
      res.json({ ok: true, avatar: avatarOut(req.user.id, saved), hide: !!(saved && saved.hide) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error: ' + e.message });
    }
  });

  // Public on purpose: <img> tags cannot send the login token. The URL carries a ?v= version so browsers cache it.
  app.get('/api/avatar/:id', async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return res.status(404).end();
      const p = await getProfile(id);
      if (!p || p.kind !== 'img' || !p.img) return res.status(404).end();
      const buf = Buffer.from(String(p.img).split(',')[1] || '', 'base64');
      res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.send(buf);
    } catch (e) {
      res.status(500).end();
    }
  });

  // ---------- XP per user per day (cached for 10 s so many students refreshing is cheap) ----------
  let xpCache = null;
  const dayOf = (r) => (r.day ? String(r.day).slice(0, 10) : String(r.created_at || '').slice(0, 10));

  async function xpByUserDay() {
    if (xpCache && Date.now() - xpCache.at < 10000) return xpCache.data;
    const rows = (await listAllActivity()).slice().sort((a, b) => {
      const x = dayOf(a), y = dayOf(b);
      return x < y ? -1 : x > y ? 1 : String(a.created_at).localeCompare(String(b.created_at));
    });
    const data = new Map();          // userId -> Map(day -> { xp, exams, reviews })
    const learnedMax = new Map();    // "userId:set" -> highest cards-learned count seen so far
    for (const r of rows) {
      const day = dayOf(r);
      if (!day) continue;
      let u = data.get(r.user_id);
      if (!u) data.set(r.user_id, (u = new Map()));
      let c = u.get(day);
      if (!c) u.set(day, (c = { xp: 0, exams: 0, reviews: 0 }));
      if (r.mode === 'exam') {
        const p = r.total ? (r.score / r.total) * 100 : 0;
        c.xp += r.score * 5 + 30 + (p >= 90 ? 100 : p >= 75 ? 50 : p >= 60 ? 20 : 0);
        c.exams++;
      } else if (r.mode === 'flashcards') {
        const key = r.user_id + ':' + r.set_letter, prev = learnedMax.get(key) || 0, score = r.score || 0;
        learnedMax.set(key, Math.max(prev, score));
        c.xp += (r.reviews || 0) * 2 + Math.max(0, score - prev) * 10;
        c.reviews += r.reviews || 0;
      }
    }
    xpCache = { at: Date.now(), data };
    return data;
  }

  // ---------- dates ----------
  const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  // The browser sends its own local date so "today" matches the student's clock (the server runs in UTC).
  function validToday(s) {
    const srv = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return srv;
    const diff = Math.abs(Date.parse(s + 'T00:00:00Z') - Date.parse(srv + 'T00:00:00Z')) / 86400000;
    return diff <= 2 ? s : srv;                       // NaN and far-off dates fall back to the server date
  }
  function weekRange(today) {                         // Monday to Sunday
    const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
    return { from: addDays(today, -dow), to: addDays(today, 6 - dow) };
  }

  // ---------- leaderboard ----------
  app.get('/api/leaderboard', auth, boardLimiter, async (req, res) => {
    try {
      const period = req.query.period === 'week' ? 'week' : 'day';
      const today = validToday(String(req.query.today || ''));
      const range = period === 'day' ? { from: today, to: today } : weekRange(today);
      const [users, profiles, byUser] = await Promise.all([listAllUsers(), listProfiles(), xpByUserDay()]);
      const prof = new Map(profiles.map((p) => [p.user_id, p]));

      const list = [];
      const me = { xp: 0, rank: null, hidden: false, admin: false };
      for (const u of users) {
        const isMe = u.id === req.user.id;
        if (effectiveRole(u) === 'admin') { if (isMe) me.admin = true; continue; }
        const p = prof.get(u.id), hidden = !!(p && p.hide);
        let xp = 0, exams = 0, reviews = 0;
        const days = byUser.get(u.id);
        if (days) for (const [day, c] of days) if (day >= range.from && day <= range.to) { xp += c.xp; exams += c.exams; reviews += c.reviews; }
        if (isMe) { me.xp = xp; me.hidden = hidden; }
        if (hidden || xp <= 0) continue;
        list.push({ name: u.name || 'Student', xp, exams, reviews, avatar: avatarOut(u.id, p), you: isMe });
      }
      list.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
      let prev = null, rank = 0;                      // ties share a rank (1, 1, 3 ...)
      list.forEach((e, i) => { if (e.xp !== prev) { rank = i + 1; prev = e.xp; } e.rank = rank; });
      const mine = list.find((e) => e.you);
      if (mine) me.rank = mine.rank;
      res.json({ period, from: range.from, to: range.to, total: list.length, entries: list.slice(0, 50), me });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error: ' + e.message });
    }
  });
};
