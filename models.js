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

module.exports = {
  Skill: mongoose.model('Skill', skillSchema),
  Project: mongoose.model('Project', projectSchema),
  Cert: mongoose.model('Cert', certSchema),
  Experience: mongoose.model('Experience', experienceSchema)
};
