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
    enum: ['admin', 'teacher'], 
    default: 'teacher' 
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

// Pre-save hook to hash password if modified
userSchema.pre('save', async function() {
  if (!this.isModified('password') || !this.password) return;
  // If already hashed (starts with $2a$ or $2b$), skip re-hashing
  if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password helper
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive fields when converting to JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
