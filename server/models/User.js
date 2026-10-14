const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    unique: true, 
    sparse: true, 
    trim: true, 
    lowercase: true 
  },
  googleId: { 
    type: String, 
    sparse: true 
  },
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true, 
    trim: true 
  },
  password: { 
    type: String 
  },
  avatar: { 
    type: String, 
    default: '' 
  },
  role: { 
    type: String, 
    enum: ['user', 'admin', 'super_admin'], 
    default: 'user' 
  },
  permissions: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isSuperAdminProtected: {
    type: Boolean,
    default: false
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLogin: { 
    type: Date, 
    default: Date.now 
  }
});

// Pre-save hook to hash password if modified and normalize role
userSchema.pre('save', async function() {
  // Normalize legacy 'teacher' role to 'user'
  if (this.role === 'teacher') {
    this.role = 'user';
  }

  // Hash password if modified
  if (this.isModified('password') && this.password) {
    if (!this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }
});

// Compare password helper
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if user has a specific permission
userSchema.methods.hasPermission = function(permission) {
  if (this.role === 'super_admin') return true;
  if (!this.isActive) return false;
  if (!this.permissions || !Array.isArray(this.permissions)) return false;
  if (this.permissions.includes('*')) return true;
  return this.permissions.includes(permission);
};

// Remove sensitive fields when converting to JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject ? this.toObject() : { ...this };
  delete obj.password;
  return obj;
};

const RealUserModel = mongoose.model('User', userSchema);
const { memoryStore, wrapModel } = require('../config/memoryStore');

module.exports = wrapModel(RealUserModel, memoryStore.users);
