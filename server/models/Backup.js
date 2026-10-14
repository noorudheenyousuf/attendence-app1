const mongoose = require('mongoose');
const { memoryStore, wrapModel } = require('../config/memoryStore');

const backupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  reason: { type: String, default: 'manual' }, // 'pre-seed', 'manual', 'pre-restore', 'export'
  classes: { type: Array, default: [] },
  subjects: { type: Array, default: [] },
  students: { type: Array, default: [] },
  attendances: { type: Array, default: [] },
  counts: {
    classes: { type: Number, default: 0 },
    subjects: { type: Number, default: 0 },
    students: { type: Number, default: 0 },
    attendances: { type: Number, default: 0 }
  },
  createdBy: {
    name: { type: String, default: 'Admin' },
    email: { type: String, default: '' },
    role: { type: String, default: 'admin' }
  },
  createdAt: { type: Date, default: Date.now }
});

const RealBackupModel = mongoose.model('Backup', backupSchema);

module.exports = wrapModel(RealBackupModel, memoryStore.backups);
