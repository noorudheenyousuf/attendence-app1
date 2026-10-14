const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  action: { type: String, required: true },
  description: { type: String, required: true },
  user: {
    name: { type: String, default: 'Admin' },
    email: { type: String, default: '' },
    role: { type: String, default: 'admin' }
  },
  details: { type: Object, default: {} },
  timestamp: { type: Date, default: Date.now }
});

const RealActivityModel = mongoose.model('Activity', activitySchema);
const { memoryStore, wrapModel } = require('../config/memoryStore');

module.exports = wrapModel(RealActivityModel, memoryStore.activities);
