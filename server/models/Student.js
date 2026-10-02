const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  rollNo: { type: String, required: true, trim: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Other'], default: 'Male' },
  parentContact: { type: String, default: '' },
  parentName: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  admissionDate: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Ensure rollNo is unique per class
studentSchema.index({ classId: 1, rollNo: 1 }, { unique: true });

module.exports = mongoose.model('Student', studentSchema);
