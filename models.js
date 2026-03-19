const mongoose = require('mongoose');

// ── SKILL CATEGORY ──
const skillSchema = new mongoose.Schema({
  cat: { type: String, required: true },
  skills: [{ type: String }],
  order: { type: Number, default: 0 }
}, { timestamps: true });

// ── PROJECT ──
const projectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  desc: { type: String, required: true },
  tools: [{ type: String }],
  link: { type: String, default: '' },
  order: { type: Number, default: 0 }
}, { timestamps: true });

// ── CERTIFICATION ──
const certSchema = new mongoose.Schema({
  title: { type: String, required: true },
  org: { type: String, default: '' },
  year: { type: String, default: '' },
  icon: { type: String, default: '🎓' },
  order: { type: Number, default: 0 }
}, { timestamps: true });

// ── EXPERIENCE ──
const experienceSchema = new mongoose.Schema({
  role: { type: String, required: true },
  company: { type: String, required: true },
  period: { type: String, default: '' },
  desc: { type: String, default: '' },
  order: { type: Number, default: 0 }
}, { timestamps: true });

// ── ANALYTICS EVENT ──
const analyticsSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['pageview','section_view','contact_submit','contact_success','login_attempt','login_success','login_fail','project_click'],
    required: true
  },
  section: { type: String, default: '' },       // which section was viewed
  device: { type: String, default: 'unknown' }, // mobile / desktop / tablet
  browser: { type: String, default: '' },
  country: { type: String, default: '' },
  city: { type: String, default: '' },
  referrer: { type: String, default: '' },
  ip: { type: String, default: '' },
  meta: { type: Object, default: {} },          // extra info (project name etc)
}, { timestamps: true });

module.exports = {
  Skill: mongoose.model('Skill', skillSchema),
  Project: mongoose.model('Project', projectSchema),
  Cert: mongoose.model('Cert', certSchema),
  Experience: mongoose.model('Experience', experienceSchema),
  Analytics: mongoose.model('Analytics', analyticsSchema)
};
