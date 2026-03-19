require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const { Skill, Project, Cert, Experience, Analytics } = require('./models');

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ──
app.use(express.json());

// CORS — allow all origins in development, specific in production
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = [
    'https://kailashdatascience.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500',
  ];
  const isGithubPages = origin && origin.endsWith('.github.io');
  const isLocal = !origin;

  if (isLocal || isGithubPages || allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kailashdatascience.github.io');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // more lenient for testing
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many messages sent. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── DATABASE ──
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ── AUTH MIDDLEWARE ──
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
}

// ── EMAIL TRANSPORTER (Gmail SMTP — more reliable than service:'gmail') ──
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // TLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Must be Gmail App Password (16 chars, no spaces)
    },
    tls: {
      rejectUnauthorized: false
    }
  });
}

// ════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Kailashwaran Portfolio API',
    time: new Date().toISOString()
  });
});

// ── DEBUG ROUTE (check if env vars are loaded) ──
// Visit: https://your-railway-url.railway.app/api/debug
app.get('/api/debug', (req, res) => {
  res.json({
    mongodb_uri_set: !!process.env.MONGODB_URI,
    jwt_secret_set: !!process.env.JWT_SECRET,
    admin_password_set: !!process.env.ADMIN_PASSWORD,
    admin_password_length: (process.env.ADMIN_PASSWORD || '').length,
    email_user: process.env.EMAIL_USER || 'NOT SET',
    email_pass_set: !!process.env.EMAIL_PASS,
    email_pass_length: (process.env.EMAIL_PASS || '').length,
    frontend_url: process.env.FRONTEND_URL || 'NOT SET',
    node_env: process.env.NODE_ENV || 'not set',
    mongodb_state: mongoose.connection.readyState,
    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  });
});

// ── AUTH ──
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.error('❌ ADMIN_PASSWORD env var not set!');
    return res.status(500).json({ error: 'Server misconfiguration. Contact admin.' });
  }
  if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET env var not set!');
    return res.status(500).json({ error: 'Server misconfiguration. Contact admin.' });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    console.log(`⚠️  Failed login attempt at ${new Date().toISOString()}`);
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  console.log(`✅ Admin login successful at ${new Date().toISOString()}`);
  res.json({ token, message: 'Login successful' });
});

app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ valid: true });
});

// ── SKILLS ──
app.get('/api/skills', async (req, res) => {
  try { res.json(await Skill.find().sort({ order: 1, createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch skills' }); }
});
app.post('/api/skills', requireAuth, async (req, res) => {
  try {
    const { cat, skills } = req.body;
    if (!cat || !skills?.length) return res.status(400).json({ error: 'Category and skills required' });
    const skill = new Skill({ cat, skills, order: await Skill.countDocuments() });
    await skill.save(); res.status(201).json(skill);
  } catch (e) { res.status(500).json({ error: 'Failed to add skill' }); }
});
app.put('/api/skills/:id', requireAuth, async (req, res) => {
  try {
    const { cat, skills } = req.body;
    if (!cat || !skills?.length) return res.status(400).json({ error: 'Category and skills required' });
    const updated = await Skill.findByIdAndUpdate(req.params.id, { cat, skills }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Failed to update skill' }); }
});
app.delete('/api/skills/:id', requireAuth, async (req, res) => {
  try { await Skill.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ error: 'Failed to delete skill' }); }
});

// ── PROJECTS ──
app.get('/api/projects', async (req, res) => {
  try { res.json(await Project.find().sort({ order: 1, createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch projects' }); }
});
app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    const { title, desc, tools, link } = req.body;
    if (!title || !desc) return res.status(400).json({ error: 'Title and description required' });
    const project = new Project({ title, desc, tools: tools || [], link: link || '', order: await Project.countDocuments() });
    await project.save(); res.status(201).json(project);
  } catch (e) { res.status(500).json({ error: 'Failed to add project' }); }
});
app.put('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const { title, desc, tools, link } = req.body;
    if (!title || !desc) return res.status(400).json({ error: 'Title and description required' });
    const updated = await Project.findByIdAndUpdate(req.params.id, { title, desc, tools: tools || [], link: link || '' }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Failed to update project' }); }
});
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try { await Project.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ error: 'Failed to delete project' }); }
});

// ── CERTIFICATIONS ──
app.get('/api/certs', async (req, res) => {
  try { res.json(await Cert.find().sort({ order: 1, createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch certs' }); }
});
app.post('/api/certs', requireAuth, async (req, res) => {
  try {
    const { title, org, year, icon } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const cert = new Cert({ title, org: org || '', year: year || '', icon: icon || '🎓', order: await Cert.countDocuments() });
    await cert.save(); res.status(201).json(cert);
  } catch (e) { res.status(500).json({ error: 'Failed to add cert' }); }
});
app.put('/api/certs/:id', requireAuth, async (req, res) => {
  try {
    const { title, org, year, icon } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const updated = await Cert.findByIdAndUpdate(req.params.id, { title, org: org || '', year: year || '', icon: icon || '🎓' }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Failed to update cert' }); }
});
app.delete('/api/certs/:id', requireAuth, async (req, res) => {
  try { await Cert.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ error: 'Failed to delete cert' }); }
});

// ── EXPERIENCE ──
app.get('/api/experience', async (req, res) => {
  try { res.json(await Experience.find().sort({ order: 1, createdAt: 1 })); }
  catch (e) { res.status(500).json({ error: 'Failed to fetch experience' }); }
});
app.post('/api/experience', requireAuth, async (req, res) => {
  try {
    const { role, company, period, desc } = req.body;
    if (!role || !company) return res.status(400).json({ error: 'Role and company required' });
    const exp = new Experience({ role, company, period: period || '', desc: desc || '', order: await Experience.countDocuments() });
    await exp.save(); res.status(201).json(exp);
  } catch (e) { res.status(500).json({ error: 'Failed to add experience' }); }
});
app.put('/api/experience/:id', requireAuth, async (req, res) => {
  try {
    const { role, company, period, desc } = req.body;
    if (!role || !company) return res.status(400).json({ error: 'Role and company required' });
    const updated = await Experience.findByIdAndUpdate(req.params.id, { role, company, period: period || '', desc: desc || '' }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Failed to update experience' }); }
});
app.delete('/api/experience/:id', requireAuth, async (req, res) => {
  try { await Experience.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(500).json({ error: 'Failed to delete experience' }); }
});

// ── CONTACT FORM ──
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Email env vars not set');
    return res.status(500).json({ error: 'Email not configured on server.' });
  }

  try {
    const transporter = createTransporter();

    // Verify SMTP connection first
    await transporter.verify();
    console.log('✅ SMTP connection verified');

    // Send to Kailashwaran
    await transporter.sendMail({
      from: `"Portfolio Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `New message from ${name} — Portfolio`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f5f4f0;border-radius:16px;">
          <h2 style="color:#111;margin-bottom:4px;">New Portfolio Message</h2>
          <p style="color:#9a9890;font-size:13px;margin-bottom:24px;">Via your portfolio contact form</p>
          <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid rgba(0,0,0,0.08);">
            <p style="margin:0 0 6px;font-size:12px;color:#9a9890;text-transform:uppercase;letter-spacing:1px;">From</p>
            <p style="margin:0 0 20px;font-size:16px;font-weight:600;color:#111;">${name} — ${email}</p>
            <p style="margin:0 0 6px;font-size:12px;color:#9a9890;text-transform:uppercase;letter-spacing:1px;">Message</p>
            <p style="margin:0;font-size:15px;color:#3d3d3a;line-height:1.7;">${message.replace(/\n/g, '<br>')}</p>
          </div>
        </div>
      `
    });

    // Auto-reply to sender
    await transporter.sendMail({
      from: `"Kailashwaran R" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Thanks for reaching out, ${name}!`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f5f4f0;border-radius:16px;">
          <h2 style="color:#111;">Hi ${name},</h2>
          <p style="color:#5a5955;font-size:15px;line-height:1.7;margin:16px 0;">Thanks for getting in touch! I've received your message and will get back to you within 24–48 hours.</p>
          <p style="color:#5a5955;font-size:15px;line-height:1.7;margin:0 0 28px;">Connect with me on <a href="https://www.linkedin.com/in/kailashwaranr2004" style="color:#1a56db;">LinkedIn</a> in the meantime.</p>
          <p style="color:#111;font-size:15px;font-weight:600;margin:0;">— Kailashwaran R</p>
          <p style="color:#9a9890;font-size:13px;margin:4px 0 0;">Data Analyst · Chennai</p>
        </div>
      `
    });

    console.log(`✅ Contact email sent from ${name} <${email}>`);
    res.json({ message: 'Message sent successfully!' });

  } catch (err) {
    console.error('❌ Email error:', err.message);
    // Return specific error to help debug
    res.status(500).json({
      error: 'Failed to send message.',
      detail: err.message // remove this line after fixing
    });
  }
});

// ── ANALYTICS ──────────────────────────────

// POST /api/track  (public — called by portfolio page)
app.post('/api/track', async (req, res) => {
  try {
    const { type, section, device, browser, referrer, meta } = req.body;
    if (!type) return res.status(400).json({ error: 'type required' });

    // Get IP and geo (best effort)
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

    // Try to get country from ip-api (free, no key needed)
    let country = '', city = '';
    try {
      const geo = await fetch(`http://ip-api.com/json/${ip}?fields=country,city`);
      const geoData = await geo.json();
      country = geoData.country || '';
      city = geoData.city || '';
    } catch { /* geo lookup failed, that's ok */ }

    const event = new Analytics({
      type, section: section || '', device: device || 'unknown',
      browser: browser || '', country, city,
      referrer: referrer || '', ip, meta: meta || {}
    });
    await event.save();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Tracking failed' });
  }
});

// GET /api/analytics/summary  (admin only)
app.get('/api/analytics/summary', requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalViews, totalContacts, totalLoginFails,
      recentEvents, deviceBreakdown, sectionBreakdown,
      countryBreakdown, dailyViews, projectClicks
    ] = await Promise.all([
      // total page views
      Analytics.countDocuments({ type: 'pageview', createdAt: { $gte: since } }),
      // contact form successes
      Analytics.countDocuments({ type: 'contact_success', createdAt: { $gte: since } }),
      // failed login attempts
      Analytics.countDocuments({ type: 'login_fail', createdAt: { $gte: since } }),
      // last 20 events
      Analytics.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20).lean(),
      // device breakdown
      Analytics.aggregate([
        { $match: { type: 'pageview', createdAt: { $gte: since } } },
        { $group: { _id: '$device', count: { $sum: 1 } } }
      ]),
      // section views
      Analytics.aggregate([
        { $match: { type: 'section_view', createdAt: { $gte: since } } },
        { $group: { _id: '$section', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      // top countries
      Analytics.aggregate([
        { $match: { type: 'pageview', createdAt: { $gte: since } } },
        { $group: { _id: '$country', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 8 }
      ]),
      // daily views for chart (last 30 days)
      Analytics.aggregate([
        { $match: { type: 'pageview', createdAt: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),
      // project link clicks
      Analytics.aggregate([
        { $match: { type: 'project_click', createdAt: { $gte: since } } },
        { $group: { _id: '$meta.project', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 5 }
      ])
    ]);

    // all-time totals
    const allTimeViews = await Analytics.countDocuments({ type: 'pageview' });
    const allTimeContacts = await Analytics.countDocuments({ type: 'contact_success' });

    res.json({
      period: days,
      summary: { totalViews, totalContacts, totalLoginFails, allTimeViews, allTimeContacts },
      deviceBreakdown, sectionBreakdown, countryBreakdown,
      dailyViews, projectClicks, recentEvents
    });
  } catch (e) {
    console.error('Analytics error:', e);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ── START ──
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Debug info at /api/debug`);
});
