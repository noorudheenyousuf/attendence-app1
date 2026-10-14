const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { logActivity } = require('../utils/logger');
const { authenticateUser, requirePermission } = require('../middleware/authMiddleware');

// GET all students (optional filter by classId, search query)
router.get('/', async (req, res) => {
  try {
    const { classId, q } = req.query;
    let filter = { isActive: true };

    if (classId && classId !== 'all') {
      filter.classId = classId;
    }

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { rollNo: { $regex: q, $options: 'i' } },
        { parentContact: { $regex: q, $options: 'i' } }
      ];
    }

    const students = await Student.find(filter)
      .populate('classId', 'name section academicYear')
      .sort({ rollNo: 1, name: 1 });

    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single student with attendance history
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('classId', 'name section academicYear');
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Aggregate student attendance
    const attendanceRecords = await Attendance.find({
      'records.studentId': student._id
    }).populate('subjectId', 'name code').sort({ date: -1 });

    let totalSessions = attendanceRecords.length;
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;

    const history = attendanceRecords.map(att => {
      const rec = att.records.find(r => r.studentId.toString() === student._id.toString());
      const status = rec ? rec.status : 'unknown';
      if (status === 'present') presentCount++;
      else if (status === 'absent') absentCount++;
      else if (status === 'late') lateCount++;

      return {
        attendanceId: att._id,
        date: att.date,
        subject: att.subjectId ? att.subjectId.name : 'General',
        status,
        remarks: rec ? rec.remarks : ''
      };
    });

    const percentage = totalSessions > 0
      ? Math.round(((presentCount + (lateCount * 0.5)) / totalSessions) * 100)
      : 100;

    res.json({
      ...student.toObject(),
      stats: {
        totalSessions,
        presentCount,
        absentCount,
        lateCount,
        percentage
      },
      history
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE student
router.post('/', authenticateUser, requirePermission('students.manage'), async (req, res) => {
  try {
    const { name, rollNo, classId, gender, parentContact, parentName, email, address, user } = req.body;

    if (!name || !rollNo || !classId) {
      return res.status(400).json({ error: 'Name, Roll Number, and Class are required' });
    }

    // Check for duplicate rollNo in this class
    const existing = await Student.findOne({ classId, rollNo: rollNo.trim(), isActive: true });
    if (existing) {
      return res.status(400).json({ error: `Student with Roll No "${rollNo}" already exists in this class` });
    }

    const student = new Student({
      name: name.trim(),
      rollNo: rollNo.trim(),
      classId,
      gender: gender || 'Male',
      parentContact: parentContact ? parentContact.trim() : '',
      parentName: parentName ? parentName.trim() : '',
      email: email ? email.trim() : '',
      address: address ? address.trim() : ''
    });

    await student.save();
    await logActivity('STUDENT_CREATED', `Added new student: ${student.name} (Roll: ${student.rollNo})`, req.user || user);

    const populated = await Student.findById(student._id).populate('classId', 'name section academicYear');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE student
router.put('/:id', authenticateUser, requirePermission('students.manage'), async (req, res) => {
  try {
    const { name, rollNo, classId, gender, parentContact, parentName, email, address, user } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (rollNo && classId) {
      const duplicate = await Student.findOne({
        _id: { $ne: student._id },
        classId: classId || student.classId,
        rollNo: rollNo.trim(),
        isActive: true
      });
      if (duplicate) {
        return res.status(400).json({ error: `Roll No "${rollNo}" already in use by another student in this class` });
      }
    }

    if (name) student.name = name.trim();
    if (rollNo) student.rollNo = rollNo.trim();
    if (classId) student.classId = classId;
    if (gender) student.gender = gender;
    if (parentContact !== undefined) student.parentContact = parentContact.trim();
    if (parentName !== undefined) student.parentName = parentName.trim();
    if (email !== undefined) student.email = email.trim();
    if (address !== undefined) student.address = address.trim();

    await student.save();
    await logActivity('STUDENT_UPDATED', `Updated student details: ${student.name}`, req.user || user);

    const populated = await Student.findById(student._id).populate('classId', 'name section academicYear');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE student
router.delete('/:id', authenticateUser, requirePermission('students.manage'), async (req, res) => {
  try {
    const { user } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Remove from future attendance records or mark inactive
    await Student.findByIdAndDelete(req.params.id);
    
    // Also pull student from any existing attendance records
    await Attendance.updateMany(
      { 'records.studentId': student._id },
      { $pull: { records: { studentId: student._id } } }
    );

    await logActivity('STUDENT_DELETED', `Deleted student: ${student.name} (Roll: ${student.rollNo})`, req.user || user);
    res.json({ success: true, message: `Student ${student.name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
