const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const USERS_FILE = path.join(__dirname, 'users.json');

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

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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
  const user = { id: Date.now().toString(), name, email, hash, createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return { id: user.id, name: user.name, email: user.email };
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

// Sign up
app.post('/api/signup', async (req, res) => {
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
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    if (e.status === 400 && e.message === 'duplicate') {
      return res.status(400).json({ error: `That ${e.field} has already been taken.` });
    }
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Log in
app.post('/api/login', async (req, res) => {
  try {
    const { email = '', password = '' } = req.body;
    const user = await findByEmail(String(email).trim());
    if (!user) return res.status(400).json({ error: 'No account found for that email.' });

    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(400).json({ error: 'Incorrect password.' });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
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
    res.json({ id: user.id, name: user.name, email: user.email });
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

app.listen(PORT, () => console.log(`Science Drills running at http://localhost:${PORT}`));

process.on('uncaughtException', e => console.error('UNCAUGHT:', e));
process.on('unhandledRejection', e => console.error('UNHANDLED REJECTION:', e));
