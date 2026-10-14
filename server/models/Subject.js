const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, default: '' },
  classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  createdAt: { type: Date, default: Date.now }
});

const RealSubjectModel = mongoose.model('Subject', subjectSchema);
const { memoryStore, wrapModel } = require('../config/memoryStore');

module.exports = wrapModel(RealSubjectModel, memoryStore.subjects);
