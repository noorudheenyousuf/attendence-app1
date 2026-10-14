const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  section: { type: String, trim: true, default: 'A' },
  academicYear: { type: String, required: true, default: () => new Date().getFullYear().toString() },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const RealClassModel = mongoose.model('Class', classSchema);
const { memoryStore, wrapModel } = require('../config/memoryStore');

module.exports = wrapModel(RealClassModel, memoryStore.classes);
