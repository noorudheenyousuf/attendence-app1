const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
  remarks: { type: String, default: '' }
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  year: { type: Number, required: true }, // e.g. 2026
  month: { type: Number, required: true }, // 1 to 12
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  markedByName: { type: String, default: 'Teacher' },
  records: [attendanceRecordSchema],
  totalStudents: { type: Number, default: 0 },
  presentCount: { type: Number, default: 0 },
  absentCount: { type: Number, default: 0 },
  lateCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure only one attendance session per class, subject, and date
attendanceSchema.index({ date: 1, classId: 1, subjectId: 1 }, { unique: true });
attendanceSchema.index({ classId: 1, year: 1, month: 1 });

const RealAttendanceModel = mongoose.model('Attendance', attendanceSchema);
const { memoryStore, wrapModel } = require('../config/memoryStore');

module.exports = wrapModel(RealAttendanceModel, memoryStore.attendances);
