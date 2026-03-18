require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const { Skill, Project, Cert, Experience } = require('./models');

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ──
app.use(express.json());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    /\.github\.io$/  // allow any github pages subdomain
  ],
  credentials: true
}));

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many messages sent. Try again later.' }
});

// ── DATABASE ──
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ── AUTH MIDDLEWARE ──
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── EMAIL TRANSPORTER ──
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Kailashwaran Portfolio API running' });
});

// ── AUTH ──────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const isValid = password === process.env.ADMIN_PASSWORD;
  if (!isValid) return res.status(401).json({ error: 'Incorrect password' });

  const token = jwt.sign(
    { role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ token, message: 'Login successful' });
});

// GET /api/auth/verify
app.get('/api/auth/verify', requireAuth, (req, res) => {
  res.json({ valid: true });
});

// ── SKILLS ────────────────────────────────

// GET all skills (public)
app.get('/api/skills', async (req, res) => {
  try {
    const skills = await Skill.find().sort({ order: 1, createdAt: 1 });
    res.json(skills);
  } catch { res.status(500).json({ error: 'Failed to fetch skills' }); }
});

// POST add skill (admin only)
app.post('/api/skills', requireAuth, async (req, res) => {
  try {
    const { cat, skills } = req.body;
    if (!cat || !skills?.length) return res.status(400).json({ error: 'Category and skills required' });
    const count = await Skill.countDocuments();
    const skill = new Skill({ cat, skills, order: count });
    await skill.save();
    res.status(201).json(skill);
  } catch { res.status(500).json({ error: 'Failed to add skill' }); }
});

// DELETE skill (admin only)
app.delete('/api/skills/:id', requireAuth, async (req, res) => {
  try {
    await Skill.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete skill' }); }
});

// PUT update skill (admin only)
app.put('/api/skills/:id', requireAuth, async (req, res) => {
  try {
    const { cat, skills } = req.body;
    if (!cat || !skills?.length) return res.status(400).json({ error: 'Category and skills required' });
    const updated = await Skill.findByIdAndUpdate(req.params.id, { cat, skills }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch { res.status(500).json({ error: 'Failed to update skill' }); }
});

// ── PROJECTS ──────────────────────────────

// GET all projects (public)
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ order: 1, createdAt: 1 });
    res.json(projects);
  } catch { res.status(500).json({ error: 'Failed to fetch projects' }); }
});

// POST add project (admin only)
app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    const { title, desc, tools, link } = req.body;
    if (!title || !desc) return res.status(400).json({ error: 'Title and description required' });
    const count = await Project.countDocuments();
    const project = new Project({ title, desc, tools: tools || [], link: link || '', order: count });
    await project.save();
    res.status(201).json(project);
  } catch { res.status(500).json({ error: 'Failed to add project' }); }
});

// DELETE project (admin only)
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete project' }); }
});

// PUT update project (admin only)
app.put('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const { title, desc, tools, link } = req.body;
    if (!title || !desc) return res.status(400).json({ error: 'Title and description required' });
    const updated = await Project.findByIdAndUpdate(req.params.id, { title, desc, tools: tools || [], link: link || '' }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch { res.status(500).json({ error: 'Failed to update project' }); }
});

// ── CERTIFICATIONS ────────────────────────

// GET all certs (public)
app.get('/api/certs', async (req, res) => {
  try {
    const certs = await Cert.find().sort({ order: 1, createdAt: 1 });
    res.json(certs);
  } catch { res.status(500).json({ error: 'Failed to fetch certs' }); }
});

// POST add cert (admin only)
app.post('/api/certs', requireAuth, async (req, res) => {
  try {
    const { title, org, year, icon } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const count = await Cert.countDocuments();
    const cert = new Cert({ title, org: org || '', year: year || '', icon: icon || '🎓', order: count });
    await cert.save();
    res.status(201).json(cert);
  } catch { res.status(500).json({ error: 'Failed to add cert' }); }
});

// DELETE cert (admin only)
app.delete('/api/certs/:id', requireAuth, async (req, res) => {
  try {
    await Cert.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete cert' }); }
});

// PUT update cert (admin only)
app.put('/api/certs/:id', requireAuth, async (req, res) => {
  try {
    const { title, org, year, icon } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const updated = await Cert.findByIdAndUpdate(req.params.id, { title, org: org||'', year: year||'', icon: icon||'🎓' }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch { res.status(500).json({ error: 'Failed to update cert' }); }
});

// ── EXPERIENCE ────────────────────────────

// GET all experience (public)
app.get('/api/experience', async (req, res) => {
  try {
    const experience = await Experience.find().sort({ order: 1, createdAt: 1 });
    res.json(experience);
  } catch { res.status(500).json({ error: 'Failed to fetch experience' }); }
});

// POST add experience (admin only)
app.post('/api/experience', requireAuth, async (req, res) => {
  try {
    const { role, company, period, desc } = req.body;
    if (!role || !company) return res.status(400).json({ error: 'Role and company required' });
    const count = await Experience.countDocuments();
    const exp = new Experience({ role, company, period: period || '', desc: desc || '', order: count });
    await exp.save();
    res.status(201).json(exp);
  } catch { res.status(500).json({ error: 'Failed to add experience' }); }
});

// DELETE experience (admin only)
app.delete('/api/experience/:id', requireAuth, async (req, res) => {
  try {
    await Experience.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete experience' }); }
});

// PUT update experience (admin only)
app.put('/api/experience/:id', requireAuth, async (req, res) => {
  try {
    const { role, company, period, desc } = req.body;
    if (!role || !company) return res.status(400).json({ error: 'Role and company required' });
    const updated = await Experience.findByIdAndUpdate(req.params.id, { role, company, period: period||'', desc: desc||'' }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch { res.status(500).json({ error: 'Failed to update experience' }); }
});

// ── CONTACT FORM ──────────────────────────

// POST /api/contact
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email and message are required' });
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    // Email to Kailashwaran
    await transporter.sendMail({
      from: `"Portfolio Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `📬 New message from ${name} — Portfolio`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#f5f4f0;border-radius:16px;">
          <h2 style="font-size:24px;font-weight:900;margin-bottom:4px;color:#111;">New Portfolio Message</h2>
          <p style="color:#9a9890;font-size:13px;margin-bottom:28px;">Someone reached out via your portfolio contact form.</p>
          <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid rgba(0,0,0,0.08);">
            <p style="margin:0 0 8px;font-size:13px;color:#9a9890;font-family:monospace;text-transform:uppercase;letter-spacing:1px;">From</p>
            <p style="margin:0 0 20px;font-size:16px;font-weight:600;color:#111;">${name} &lt;${email}&gt;</p>
            <p style="margin:0 0 8px;font-size:13px;color:#9a9890;font-family:monospace;text-transform:uppercase;letter-spacing:1px;">Message</p>
            <p style="margin:0;font-size:15px;color:#3d3d3a;line-height:1.7;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          <p style="margin-top:20px;font-size:12px;color:#9a9890;text-align:center;">Sent from kailashdatascience.github.io</p>
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
          <h2 style="font-size:24px;font-weight:900;color:#111;">Hi ${name},</h2>
          <p style="color:#5a5955;font-size:15px;line-height:1.7;margin:16px 0;">Thanks for getting in touch! I've received your message and will get back to you within 24–48 hours.</p>
          <p style="color:#5a5955;font-size:15px;line-height:1.7;margin:0 0 28px;">In the meantime, feel free to connect with me on <a href="https://www.linkedin.com/in/kailashwaranr2004" style="color:#1a56db;">LinkedIn</a>.</p>
          <p style="color:#111;font-size:15px;font-weight:600;margin:0;">— Kailashwaran R</p>
          <p style="color:#9a9890;font-size:13px;margin:4px 0 0;">Data Analyst · Chennai</p>
        </div>
      `
    });

    res.json({ message: 'Message sent successfully!' });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

// ── START ──
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
