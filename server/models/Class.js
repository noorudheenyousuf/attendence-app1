const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  section: { type: String, trim: true, default: 'A' },
  academicYear: { type: String, required: true, default: () => new Date().getFullYear().toString() },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Class', classSchema);
