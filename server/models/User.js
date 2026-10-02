const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: { type: String },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  avatar: { type: String, default: '' },
  role: { type: String, enum: ['admin', 'teacher'], default: 'teacher' },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
