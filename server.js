const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const USERS_FILE = path.join(__dirname, 'users.json');

// Comma-separated emails that are always admins (teacher accounts), e.g. ADMIN_EMAILS=teacher@school.com
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
function effectiveRole(u) {
  if (u && u.role === 'admin') return 'admin';
  if (u && u.email && ADMIN_EMAILS.includes(String(u.email).toLowerCase())) return 'admin';
  return 'student';
}
function publicUser(u) { return { id: u.id, name: u.name, email: u.email, role: effectiveRole(u) }; }

// Supabase (used when env vars are set, e.g. on Render).
// Set SUPABASE_URL + SUPABASE_SERVICE_KEY in env. Locally without them,
// the app falls back to users.json so it still works offline.
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  console.log('Using Supabase for user storage.');
} else {
  console.log('SUPABASE_URL/SUPABASE_SERVICE_KEY not set — using local users.json.');
}

// Render (and most hosts) sit behind a proxy. Needed so rate limits see the real visitor IP.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // pages use inline <script>/<style>; Chart.js comes from cdnjs
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      // scores now go to this server (Supabase); Google Apps Script is no longer used
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(cors());
app.use(express.json({ limit: '50kb' }));

// Only serve the website pages. Without this, express.static(__dirname) would also expose
// server.js, users.json (password hashes), activity.json, package.json, etc.
// theme.css and game.js are the only non-HTML files allowed (shared styles + gamification logic).
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (/^\/(?:[A-Za-z0-9_-]+\.html|theme\.css|game\.js)?$/.test(req.path)) return next();
  res.status(404).send('Not found');
});
app.use(express.static(__dirname));

// ---- rate limits (per visitor IP) ----
const limitMsg = (text) => ({ error: text });
const baseLimit = { standardHeaders: 'draft-7', legacyHeaders: false };
const signupLimiter = rateLimit({ ...baseLimit, windowMs: 60 * 60 * 1000, limit: 20,
  message: limitMsg('Too many sign-ups from this network. Please try again in an hour.') });
const loginLimiter = rateLimit({ ...baseLimit, windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true,
  message: limitMsg('Too many failed log-in attempts. Please wait 15 minutes and try again.') });
const forgotLimiter = rateLimit({ ...baseLimit, windowMs: 15 * 60 * 1000, limit: 10,
  message: limitMsg('Too many reset requests. Please wait 15 minutes and try again.') });
const resetLimiter = rateLimit({ ...baseLimit, windowMs: 15 * 60 * 1000, limit: 10,
  message: limitMsg('Too many attempts. Please wait 15 minutes and try again.') });
// Flashcard sync is limited per logged-in user (a whole class may share one school IP).
const syncLimiter = rateLimit({ ...baseLimit, windowMs: 60 * 1000, limit: 120,
  keyGenerator: (req) => 'u:' + (req.user && req.user.id),
  message: limitMsg('Syncing too fast. Please wait a moment.') });

// ---- storage layer (Supabase or local file) ----
function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Basic email format: something@something.tld (no spaces)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Escape % _ \ so ilike treats them as plain characters
function escapeLike(s) {
  return s.replace(/[\\%_]/g, '\\$&');
}

async function findByEmail(email) {
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*').ilike('email', escapeLike(email)).limit(1);
    if (error) throw new Error(error.message);
    return data[0] || null;
  }
  return loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findByName(name) {
  if (supabase) {
    const { data, error } = await supabase.from('users').select('id').ilike('name', escapeLike(name)).limit(1);
    if (error) throw new Error(error.message);
    return data[0] || null;
  }
  return loadUsers().find(u => (u.name || '').toLowerCase() === name.toLowerCase()) || null;
}

async function findById(id) {
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).limit(1);
    if (error) throw new Error(error.message);
    return data[0] || null;
  }
  return loadUsers().find(u => u.id === id) || null;
}

async function createUser({ name, email, hash }) {
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .insert({ name, email, hash })
      .select('id, name, email')
      .single();
    if (error) {
      if (error.code === '23505') {
        const field = (error.message || '').includes('users_name_lower_idx') ? 'username' : 'email';
        throw Object.assign(new Error('duplicate'), { status: 400, field });
      }
      throw new Error(error.message);
    }
    return data;
  }
  const users = loadUsers();
  const user = { id: Date.now().toString(), name, email, hash, role: 'student', createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return { id: user.id, name: user.name, email: user.email };
}

// Pages through Supabase results (hosted projects usually cap a single response at 1000 rows).
async function fetchAllRows(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function listAllUsers() {
  if (supabase) {
    return fetchAllRows((a, b) => supabase.from('users').select('*').order('created_at').order('id').range(a, b));
  }
  return loadUsers().map(u => ({ ...u, created_at: u.createdAt }));
}

// ---- activity (exam attempts + flashcard study), per user ----
const ACTIVITY_FILE = path.join(__dirname, 'activity.json');
function loadActivity() {
  try { return JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8')); } catch { return []; }
}
function saveActivityFile(rows) {
  fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(rows, null, 2));
}

async function listActivity(userId) {
  if (supabase) {
    const { data, error } = await supabase.from('activity').select('*')
      .eq('user_id', userId).order('created_at', { ascending: true }).limit(5000);
    if (error) throw new Error(error.message);
    return data;
  }
  return loadActivity().filter(r => r.user_id === userId);
}

async function listAllActivity() {
  if (supabase) {
    return fetchAllRows((a, b) => supabase.from('activity').select('*').order('created_at').order('id').range(a, b));
  }
  return loadActivity();
}

// Exams insert a row per attempt. Flashcards keep one row per user/set/day (reviews add up).
async function recordActivity(userId, a) {
  const nowIso = new Date().toISOString();
  if (supabase) {
    if (a.mode === 'flashcards') {
      const { data, error } = await supabase.from('activity').select('*')
        .eq('user_id', userId).eq('mode', 'flashcards').eq('set_letter', a.set_letter).eq('day', a.day).limit(1);
      if (error) throw new Error(error.message);
      if (data[0]) {
        const r = data[0];
        const { error: e2 } = await supabase.from('activity').update({
          score: a.score, total: a.total, reviews: r.reviews + a.reviews,
          again: r.again + a.again, hard: r.hard + a.hard, good: r.good + a.good, updated_at: nowIso
        }).eq('id', r.id);
        if (e2) throw new Error(e2.message);
        return;
      }
    }
    const { error } = await supabase.from('activity').insert({ user_id: userId, ...a });
    if (error) throw new Error(error.message);
    return;
  }
  const rows = loadActivity();
  const r = a.mode === 'flashcards' && rows.find(x => x.user_id === userId && x.mode === 'flashcards' && x.set_letter === a.set_letter && x.day === a.day);
  if (r) {
    Object.assign(r, { score: a.score, total: a.total, reviews: r.reviews + a.reviews,
      again: r.again + a.again, hard: r.hard + a.hard, good: r.good + a.good, updated_at: nowIso });
  } else {
    rows.push({ id: Date.now().toString() + Math.random().toString(36).slice(2, 6), user_id: userId, ...a, created_at: nowIso, updated_at: nowIso });
  }
  saveActivityFile(rows);
}

// ---- flashcard spaced-repetition state (one row per user + set) ----
const FLASH_FILE = path.join(__dirname, 'flashstate.json');
function loadFlash() { try { return JSON.parse(fs.readFileSync(FLASH_FILE, 'utf8')); } catch { return {}; } }

async function getFlashState(userId, set) {
  if (supabase) {
    const { data, error } = await supabase.from('flashcard_state').select('state, updated_at')
      .eq('user_id', userId).eq('set_letter', set).limit(1);
    if (error) throw new Error(error.message);
    return data[0] || null;
  }
  return loadFlash()[userId + ':' + set] || null;
}
async function putFlashState(userId, set, state) {
  const updated_at = new Date().toISOString();
  if (supabase) {
    const { error } = await supabase.from('flashcard_state')
      .upsert({ user_id: userId, set_letter: set, state, updated_at }, { onConflict: 'user_id,set_letter' });
    if (error) throw new Error(error.message);
    return;
  }
  const all = loadFlash();
  all[userId + ':' + set] = { state, updated_at };
  fs.writeFileSync(FLASH_FILE, JSON.stringify(all));
}

// Accept only the fields the flashcard scheduler uses, with sane types and sizes.
function cleanFlashState(st) {
  if (!st || typeof st !== 'object' || !Array.isArray(st.cards) || st.cards.length < 1 || st.cards.length > 300) return null;
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const cards = [];
  for (const c of st.cards) {
    if (!c || typeof c !== 'object') return null;
    const o = {};
    for (const k of ['s', 'step', 'due', 'ivl', 'ease', 'lapses', 'reps']) {
      if (!num(c[k])) return null;
      o[k] = c[k];
    }
    if (o.s < 0 || o.s > 3 || o.s % 1 !== 0) return null;
    o.t = num(c.t) ? c.t : 0;
    cards.push(o);
  }
  return {
    cards,
    day: num(st.day) ? st.day : 0,
    newToday: Math.max(0, Math.min(1000, Math.floor(num(st.newToday) ? st.newToday : 0))),
    newLimit: Math.max(1, Math.min(1000, Math.floor(num(st.newLimit) ? st.newLimit : 20))),
    saved: num(st.saved) ? st.saved : Date.now()
  };
}

// ---- password reset codes (one active code per user) ----
const RESETS_FILE = path.join(__dirname, 'resets.json');
function loadResets() { try { return JSON.parse(fs.readFileSync(RESETS_FILE, 'utf8')); } catch { return {}; } }
function saveResets(o) { fs.writeFileSync(RESETS_FILE, JSON.stringify(o, null, 2)); }

async function putReset(userId, codeHash, expiresAt) {
  const row = { user_id: userId, code_hash: codeHash, expires_at: expiresAt, attempts: 0, created_at: new Date().toISOString() };
  if (supabase) {
    const { error } = await supabase.from('password_resets').upsert(row, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
    return;
  }
  const all = loadResets(); all[userId] = row; saveResets(all);
}
async function getReset(userId) {
  if (supabase) {
    const { data, error } = await supabase.from('password_resets').select('*').eq('user_id', userId).limit(1);
    if (error) throw new Error(error.message);
    return data[0] || null;
  }
  return loadResets()[userId] || null;
}
async function setResetAttempts(userId, attempts) {
  if (supabase) {
    const { error } = await supabase.from('password_resets').update({ attempts }).eq('user_id', userId);
    if (error) throw new Error(error.message);
    return;
  }
  const all = loadResets(); if (all[userId]) { all[userId].attempts = attempts; saveResets(all); }
}
async function deleteReset(userId) {
  if (supabase) {
    const { error } = await supabase.from('password_resets').delete().eq('user_id', userId);
    if (error) throw new Error(error.message);
    return;
  }
  const all = loadResets(); delete all[userId]; saveResets(all);
}
async function setPasswordHash(userId, hash) {
  if (supabase) {
    const { error } = await supabase.from('users').update({ hash }).eq('id', userId);
    if (error) throw new Error(error.message);
    return;
  }
  const users = loadUsers(); const u = users.find(x => x.id === userId);
  if (u) { u.hash = hash; saveUsers(users); }
}
function hashCode(userId, code) {
  return crypto.createHmac('sha256', SECRET).update(userId + ':' + code).digest('hex');
}

// ---- mailer ----
// Option 1 (works on Render free tier, uses HTTPS): Brevo.  Set BREVO_API_KEY and MAIL_FROM (a sender verified in Brevo).
// Option 2 (needs SMTP, so Render PAID plan or your own computer): Gmail.  Set GMAIL_USER and GMAIL_APP_PASSWORD.
// Local testing only: DEV_MAIL_LOG=1 prints the email in the server console instead of sending it.
function mailerConfigured() {
  return !!((process.env.BREVO_API_KEY && process.env.MAIL_FROM) ||
            (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) ||
            process.env.DEV_MAIL_LOG === '1');
}
let gmailTransport = null;
async function sendMail(to, subject, text, html) {
  if (process.env.BREVO_API_KEY && process.env.MAIL_FROM) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: 'Science Drills', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, textContent: text, htmlContent: html })
    });
    if (!r.ok) throw new Error('Brevo error ' + r.status + ': ' + (await r.text()));
    return;
  }
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    if (!gmailTransport) {
      gmailTransport = require('nodemailer').createTransport({
        service: 'gmail', connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
      });
    }
    await gmailTransport.sendMail({ from: '"Science Drills" <' + process.env.GMAIL_USER + '>', to, subject, text, html });
    return;
  }
  console.log('[DEV_MAIL_LOG] To: ' + to + '\nSubject: ' + subject + '\n' + text);
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

// Role is always read from the database (not the token), so removing someone's admin role takes effect immediately.
async function requireAdmin(req, res, next) {
  try {
    const u = await findById(req.user.id);
    if (!u || effectiveRole(u) !== 'admin') return res.status(403).json({ error: 'Admins only.' });
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
}

// Sign up
app.post('/api/signup', signupLimiter, async (req, res) => {
  try {
    let { name = '', email = '', password = '' } = req.body;
    name = String(name).trim();
    email = String(email).trim();
    password = String(password);

    if (!name) return res.status(400).json({ error: 'Username is required.' });
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    if (await findByName(name)) {
      return res.status(400).json({ error: 'That username has already been taken.' });
    }
    if (await findByEmail(email)) {
      return res.status(400).json({ error: 'That email has already been taken. Try logging in.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await createUser({ name, email, hash });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    if (e.status === 400 && e.message === 'duplicate') {
      return res.status(400).json({ error: `That ${e.field} has already been taken.` });
    }
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Log in
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { email = '', password = '' } = req.body;
    const user = await findByEmail(String(email).trim());
    if (!user) return res.status(400).json({ error: 'Incorrect email or password.' });

    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(400).json({ error: 'Incorrect email or password.' });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Forgot password: email a 6-digit code (valid 10 minutes)
app.post('/api/forgot', forgotLimiter, async (req, res) => {
  const email = String((req.body || {}).email || '').trim();
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!mailerConfigured()) return res.status(503).json({ error: 'Password reset by email is not set up yet. Please contact your teacher.' });

  // Same answer whether or not the account exists, so nobody can probe which emails are registered.
  const generic = { ok: true, message: 'If that email is registered, a 6-digit code has been sent. It expires in 10 minutes.' };
  try {
    const user = await findByEmail(email);
    if (user) {
      const existing = await getReset(user.id);
      if (existing && Date.now() - new Date(existing.created_at).getTime() < 60 * 1000) return res.json(generic); // 1 per minute
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await putReset(user.id, hashCode(user.id, code), new Date(Date.now() + 10 * 60 * 1000).toISOString());
      const text = 'Your Science Drills password reset code is ' + code + '.\n\nIt expires in 10 minutes. If you did not ask for this, you can ignore this email.';
      const html = '<p>Your Science Drills password reset code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">' + code +
                   '</p><p>It expires in 10 minutes. If you did not ask for this, you can ignore this email.</p>';
      await sendMail(user.email, 'Your Science Drills reset code', text, html);
    }
  } catch (e) {
    console.error('Forgot-password error:', e.message);
  }
  res.json(generic);
});

// Reset password with the emailed code
app.post('/api/reset', resetLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim();
    const code = String(b.code || '').trim();
    const password = String(b.password || '');
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const fail = () => res.status(400).json({ error: 'Invalid or expired code.' });
    if (!/^\d{6}$/.test(code)) return fail();

    const user = await findByEmail(email);
    if (!user) return fail();
    const r = await getReset(user.id);
    if (!r) return fail();
    if (new Date(r.expires_at).getTime() < Date.now() || r.attempts >= 5) { await deleteReset(user.id); return fail(); }

    const given = Buffer.from(hashCode(user.id, code), 'hex');
    const real = Buffer.from(r.code_hash, 'hex');
    if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
      await setResetAttempts(user.id, r.attempts + 1);
      return fail();
    }

    await setPasswordHash(user.id, await bcrypt.hash(password, 10));
    await deleteReset(user.id);
    res.json({ ok: true, message: 'Password updated. You can log in now.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Current user
app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(publicUser(user));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Save progress (exam attempt or flashcard study)
const clampInt = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
app.post('/api/activity', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const mode = b.mode;
    const set_letter = String(b.set || '').toUpperCase();
    const total = clampInt(b.total, 1000);
    if (!['exam', 'flashcards'].includes(mode) || !/^[A-Z]$/.test(set_letter) || !total) {
      return res.status(400).json({ error: 'Invalid activity.' });
    }
    const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || '') ? b.day : new Date().toISOString().slice(0, 10);
    await recordActivity(req.user.id, {
      mode, set_letter, day, total,
      score: Math.min(clampInt(b.score, 1000), total),
      unanswered: Math.min(clampInt(b.unanswered, 1000), total),
      duration_sec: mode === 'exam' ? clampInt(b.durationSec, 86400) : null,
      reviews: clampInt(b.reviews, 5000),
      again: clampInt(b.again, 5000),
      hard: clampInt(b.hard, 5000),
      good: clampInt(b.good, 5000)
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Get this user's progress
app.get('/api/activity', auth, async (req, res) => {
  try {
    res.json(await listActivity(req.user.id));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ---- flashcard cloud sync ----
app.get('/api/sync/:set', auth, syncLimiter, async (req, res) => {
  try {
    const set = String(req.params.set).toUpperCase();
    if (!/^[A-Z]$/.test(set)) return res.status(400).json({ error: 'Invalid set.' });
    const row = await getFlashState(req.user.id, set);
    res.json(row ? { state: row.state, updated_at: row.updated_at } : { state: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

app.put('/api/sync/:set', auth, syncLimiter, async (req, res) => {
  try {
    const set = String(req.params.set).toUpperCase();
    if (!/^[A-Z]$/.test(set)) return res.status(400).json({ error: 'Invalid set.' });
    const state = cleanFlashState((req.body || {}).state);
    if (!state) return res.status(400).json({ error: 'Invalid flashcard state.' });
    await putFlashState(req.user.id, set, state);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// ---- teacher / admin ----
// One call returns a per-student summary and every exam attempt. The page filters, sorts and exports CSV in the browser.
app.get('/api/admin/data', auth, requireAdmin, async (req, res) => {
  try {
    const [users, acts] = await Promise.all([listAllUsers(), listAllActivity()]);
    const stats = new Map(users.map(u => [u.id, {
      id: u.id, name: u.name || '', email: u.email, role: effectiveRole(u), joined: u.created_at || null,
      exams: 0, pctSum: 0, best: 0, reviews: 0, learnedBySet: {}, last: null
    }]));
    const attempts = [];
    for (const r of acts) {
      const s = stats.get(r.user_id);
      if (!s) continue;
      const day = r.day ? String(r.day).slice(0, 10) : String(r.created_at || '').slice(0, 10);
      if (day && (!s.last || day > s.last)) s.last = day;
      const pct = r.total ? (r.score / r.total) * 100 : 0;
      if (r.mode === 'exam') {
        s.exams++; s.pctSum += pct; s.best = Math.max(s.best, pct);
        attempts.push({
          user_id: s.id, name: s.name, email: s.email, set: r.set_letter, score: r.score, total: r.total,
          pct: Math.round(pct * 10) / 10, unanswered: r.unanswered || 0,
          minutes: r.duration_sec ? Math.round(r.duration_sec / 6) / 10 : null, day, at: r.created_at
        });
      } else if (r.mode === 'flashcards') {
        s.reviews += r.reviews || 0;
        s.learnedBySet[r.set_letter] = Math.max(s.learnedBySet[r.set_letter] || 0, r.score || 0);
      }
    }
    attempts.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const students = [...stats.values()].map(s => ({
      id: s.id, name: s.name, email: s.email, role: s.role, joined: s.joined,
      exams: s.exams, avg: s.exams ? Math.round((s.pctSum / s.exams) * 10) / 10 : null,
      best: s.exams ? Math.round(s.best * 10) / 10 : null,
      reviews: s.reviews, learned: Object.values(s.learnedBySet).reduce((a, b) => a + b, 0), last: s.last
    }));
    res.json({ students, attempts });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

app.listen(PORT, () => console.log(`Science Drills running at http://localhost:${PORT}`));

process.on('uncaughtException', e => console.error('UNCAUGHT:', e));
process.on('unhandledRejection', e => console.error('UNHANDLED REJECTION:', e));
