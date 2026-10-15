const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const { logActivity } = require('../utils/logger');

// GET attendance session for a specific date, class, and subject
router.get('/session', async (req, res) => {
  try {
    const { date, classId, subjectId } = req.query;

    if (!date || !classId || !subjectId) {
      return res.status(400).json({ error: 'date, classId, and subjectId are required parameters' });
    }

    // Fetch all active students in this class
    const students = await Student.find({ classId, isActive: true }).sort({ rollNo: 1, name: 1 });

    // Check if an attendance record already exists
    const existing = await Attendance.findOne({ date, classId, subjectId })
      .populate('records.studentId', 'name rollNo gender parentContact');

    if (existing) {
      // Map students to include current status
      const studentMap = {};
      existing.records.forEach(r => {
        if (r.studentId) {
          studentMap[r.studentId._id ? r.studentId._id.toString() : r.studentId.toString()] = {
            status: r.status,
            remarks: r.remarks || ''
          };
        }
      });

      const mergedStudents = students.map(st => {
        const recorded = studentMap[st._id.toString()];
        return {
          _id: st._id,
          name: st.name,
          rollNo: st.rollNo,
          gender: st.gender,
          status: recorded ? recorded.status : 'present',
          remarks: recorded ? recorded.remarks : ''
        };
      });

      return res.json({
        isExisting: true,
        sessionId: existing._id,
        date: existing.date,
        classId: existing.classId,
        subjectId: existing.subjectId,
        markedByName: existing.markedByName,
        summary: {
          total: existing.totalStudents,
          present: existing.presentCount,
          absent: existing.absentCount,
          late: existing.lateCount
        },
        students: mergedStudents
      });
    }

    // If new session, default all students to 'present'
    const newStudents = students.map(st => ({
      _id: st._id,
      name: st.name,
      rollNo: st.rollNo,
      gender: st.gender,
      status: 'present',
      remarks: ''
    }));

    res.json({
      isExisting: false,
      date,
      classId,
      subjectId,
      students: newStudents,
      summary: {
        total: newStudents.length,
        present: newStudents.length,
        absent: 0,
        late: 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / Save or Update attendance session
router.post('/', async (req, res) => {
  try {
    const { date, classId, subjectId, records, user } = req.body;

    if (!date || !classId || !subjectId || !Array.isArray(records)) {
      return res.status(400).json({ error: 'date, classId, subjectId, and records array are required' });
    }

    const dateParts = date.split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;

    const formattedRecords = records.map(r => {
      const status = ['present', 'absent', 'late'].includes(r.status) ? r.status : 'present';
      if (status === 'present') presentCount++;
      else if (status === 'absent') absentCount++;
      else if (status === 'late') lateCount++;

      return {
        studentId: r.studentId,
        status,
        remarks: r.remarks || ''
      };
    });

    const totalStudents = formattedRecords.length;

    const [clsDoc, subjDoc] = await Promise.all([
      Class.findById(classId),
      Subject.findById(subjectId)
    ]);

    const className = clsDoc ? `${clsDoc.name} ${clsDoc.section}` : 'Class';
    const subjectName = subjDoc ? subjDoc.name : 'Subject';
    const userName = (user && user.name) ? user.name : 'Teacher';

    // Check if updating or creating
    const isUpdate = await Attendance.exists({ date, classId, subjectId });

    const attendance = await Attendance.findOneAndUpdate(
      { date, classId, subjectId },
      {
        date,
        year,
        month,
        classId,
        subjectId,
        markedByName: userName,
        records: formattedRecords,
        totalStudents,
        presentCount,
        absentCount,
        lateCount,
        updatedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const actionType = isUpdate ? 'ATTENDANCE_UPDATED' : 'ATTENDANCE_MARKED';
    const actionDesc = `${isUpdate ? 'Updated' : 'Marked'} attendance for ${className} - ${subjectName} on ${date} (${presentCount}/${totalStudents} Present)`;

    await logActivity(actionType, actionDesc, user, {
      date,
      classId,
      subjectId,
      totalStudents,
      presentCount,
      absentCount
    });

    res.json({
      success: true,
      message: actionDesc,
      attendance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET recent attendance sessions
router.get('/recent', async (req, res) => {
  try {
    const recent = await Attendance.find()
      .populate('classId', 'name section')
      .populate('subjectId', 'name code')
      .sort({ updatedAt: -1, date: -1 })
      .limit(10);
    res.json(recent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE single session
router.delete('/:id', async (req, res) => {
  try {
    const { user } = req.body;
    const session = await Attendance.findById(req.params.id)
      .populate('classId', 'name section')
      .populate('subjectId', 'name');

    if (!session) return res.status(404).json({ error: 'Session not found' });

    await Attendance.findByIdAndDelete(req.params.id);
    await logActivity('ATTENDANCE_DELETED', `Deleted attendance session for ${session.date}`, user);

    res.json({ success: true, message: 'Attendance session deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
