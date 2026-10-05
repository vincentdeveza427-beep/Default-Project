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

async function findByEmail(email) {
  async function findByName(name) {
  if (supabase) {
    const { data, error } = await supabase.from('users').select('id').ilike('name', name).limit(1);
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
      if (error.code === '23505') throw Object.assign(new Error('duplicate'), { status: 400 });
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
    name = name.trim();
    email = email.trim();

    if (!name) return res.status(400).json({ error: 'Username is required.' });
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    if (await findByName(name)) {
      return res.status(400).json({ error: 'That username has already been taken.' });
    }
    if (await findByEmail(email)) {
      return res.status(400).json({ error: 'That email has already been taken. Try logging in.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await createUser({ name, email, hash });
    // ...rest unchanged

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    if (e.status === 400 && e.message === 'duplicate') {
      return res.status(400).json({ error: 'That email is already registered. Try logging in.' });
    }
    console.error(e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// Log in
app.post('/api/login', async (req, res) => {
  try {
    const { email = '', password = '' } = req.body;
    const user = await findByEmail(email);
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

app.listen(PORT, () => console.log(`Science Drills running at http://localhost:${PORT}`));

process.on('uncaughtException', e => console.error('UNCAUGHT:', e));
process.on('unhandledRejection', e => console.error('UNHANDLED REJECTION:', e));
