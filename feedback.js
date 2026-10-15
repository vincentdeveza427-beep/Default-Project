// feedback.js - student feedback box + teacher inbox.
// Mounted from server.js with ONE line (put it next to the social.js line):
//     require('./feedback.js')({ app, auth, requireAdmin, supabase, fetchAllRows, listAllUsers, rateLimit, baseLimit, limitMsg });
//
// Endpoints
//   POST   /api/feedback             -> logged-in student sends { category, message }
//   GET    /api/admin/feedback       -> teacher: every message with the sender's name and email
//   PUT    /api/admin/feedback/:id   -> teacher: set status to new | read | resolved
//   DELETE /api/admin/feedback/:id   -> teacher: delete a message
//
// Storage: Supabase table "feedback" (see supabase-feedback.sql), or feedback.json when running locally without Supabase.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function mountFeedback(d) {
  const { app, auth, requireAdmin, supabase, fetchAllRows, listAllUsers, rateLimit, baseLimit, limitMsg } = d;

  const CATS = ['question', 'bug', 'suggestion', 'other'];
  const STATUSES = ['new', 'read', 'resolved'];
  const perUser = (req) => 'u:' + (req.user && req.user.id);
  const sendLimiter = rateLimit({ ...baseLimit, windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: perUser,
    message: limitMsg('You have sent several messages recently. Please try again in a while.') });
  const adminLimiter = rateLimit({ ...baseLimit, windowMs: 60 * 1000, limit: 120, keyGenerator: perUser,
    message: limitMsg('Too many requests. Please wait a moment.') });

  // ---------- storage ----------
  const FILE = path.join(__dirname, 'feedback.json');
  const loadAll = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
  const saveAll = (rows) => fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));

  async function insertFeedback(row) {
    if (supabase) {
      const { error } = await supabase.from('feedback').insert(row);
      if (error) throw new Error(error.message);
      return;
    }
    const rows = loadAll();
    rows.push({ id: crypto.randomUUID(), ...row, status: 'new', created_at: new Date().toISOString() });
    saveAll(rows);
  }
  async function listFeedback() {
    if (supabase) {
      return fetchAllRows((a, b) => supabase.from('feedback').select('*')
        .order('created_at', { ascending: false }).order('id').range(a, b));
    }
    return loadAll().sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  }
  async function setStatus(id, status) {
    if (supabase) {
      const { error } = await supabase.from('feedback').update({ status }).eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
    const rows = loadAll(), r = rows.find((x) => x.id === id);
    if (r) { r.status = status; saveAll(rows); }
  }
  async function removeFeedback(id) {
    if (supabase) {
      const { error } = await supabase.from('feedback').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return;
    }
    saveAll(loadAll().filter((x) => x.id !== id));
  }

  const validId = (s) => /^[A-Za-z0-9-]{1,64}$/.test(String(s));
  const fail = (res, e) => { console.error(e); res.status(500).json({ error: 'Server error: ' + e.message }); };

  // ---------- student: send feedback ----------
  app.post('/api/feedback', auth, sendLimiter, async (req, res) => {
    try {
      const b = req.body || {};
      const category = CATS.includes(b.category) ? b.category : 'other';
      const message = String(b.message || '').replace(/\r\n/g, '\n').trim();
      if (message.length < 3) return res.status(400).json({ error: 'Please write a little more (at least 3 characters).' });
      if (message.length > 2000) return res.status(400).json({ error: 'That message is too long (2000 characters maximum).' });
      await insertFeedback({ user_id: req.user.id, category, message });
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // ---------- teacher: read and manage ----------
  app.get('/api/admin/feedback', auth, requireAdmin, adminLimiter, async (req, res) => {
    try {
      const [rows, users] = await Promise.all([listFeedback(), listAllUsers()]);
      const who = new Map(users.map((u) => [u.id, u]));
      const items = rows.slice(0, 1000).map((r) => {
        const u = who.get(r.user_id);
        return {
          id: r.id, category: r.category, message: r.message, status: r.status || 'new', at: r.created_at,
          name: u ? (u.name || '') : '', email: u ? u.email : '', deleted: !u
        };
      });
      res.json({ items });
    } catch (e) { fail(res, e); }
  });

  app.put('/api/admin/feedback/:id', auth, requireAdmin, adminLimiter, async (req, res) => {
    try {
      const id = String(req.params.id), status = (req.body || {}).status;
      if (!validId(id) || !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid request.' });
      await setStatus(id, status);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  app.delete('/api/admin/feedback/:id', auth, requireAdmin, adminLimiter, async (req, res) => {
    try {
      const id = String(req.params.id);
      if (!validId(id)) return res.status(400).json({ error: 'Invalid request.' });
      await removeFeedback(id);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
};
