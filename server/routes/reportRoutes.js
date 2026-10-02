const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Subject = require('../models/Subject');

// GET Attendance Report with flexible multi-dimensional filters
router.get('/', async (req, res) => {
  try {
    const { classId, subjectId, year, month } = req.query;

    if (!classId) {
      return res.status(400).json({ error: 'classId is required to generate report' });
    }

    // Retrieve class info
    const selectedClass = await Class.findById(classId);
    if (!selectedClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Build filter for Attendance collection
    const query = { classId };

    if (subjectId && subjectId !== 'all') {
      query.subjectId = subjectId;
    }

    if (year && year !== 'all') {
      query.year = parseInt(year, 10);
    }

    if (month && month !== 'all') {
      query.month = parseInt(month, 10);
    }

    // Retrieve matching attendance sessions
    const sessions = await Attendance.find(query)
      .populate('subjectId', 'name code')
      .sort({ date: -1 });

    // Retrieve all active students in this class
    const students = await Student.find({ classId, isActive: true })
      .sort({ rollNo: 1, name: 1 })
      .lean();

    const totalSessions = sessions.length;

    // Calculate per-student stats
    const studentReports = students.map(student => {
      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      let unrecordedCount = 0;

      const sessionLogs = [];

      sessions.forEach(session => {
        const record = session.records.find(
          r => r.studentId && r.studentId.toString() === student._id.toString()
        );

        if (record) {
          if (record.status === 'present') presentCount++;
          else if (record.status === 'absent') absentCount++;
          else if (record.status === 'late') lateCount++;
          
          sessionLogs.push({
            date: session.date,
            subjectName: session.subjectId ? session.subjectId.name : 'General',
            status: record.status,
            remarks: record.remarks || ''
          });
        } else {
          unrecordedCount++;
        }
      });

      // Effective attendance: Present = 1, Late = 0.5
      const effectivePresent = presentCount + (lateCount * 0.5);
      const percentage = totalSessions > 0
        ? Math.round((effectivePresent / totalSessions) * 100)
        : 100;

      let badge = 'Excellent';
      let badgeClass = 'badge-success';
      if (percentage < 60) {
        badge = 'Critical';
        badgeClass = 'badge-danger';
      } else if (percentage < 75) {
        badge = 'Warning';
        badgeClass = 'badge-warning';
      } else if (percentage < 85) {
        badge = 'Good';
        badgeClass = 'badge-info';
      }

      return {
        studentId: student._id,
        name: student.name,
        rollNo: student.rollNo,
        gender: student.gender,
        parentContact: student.parentContact,
        totalSessions,
        presentCount,
        absentCount,
        lateCount,
        percentage,
        badge,
        badgeClass,
        sessionLogs
      };
    });

    // Calculate overall class attendance average
    const classAverage = studentReports.length > 0 && totalSessions > 0
      ? Math.round(
          studentReports.reduce((acc, curr) => acc + curr.percentage, 0) / studentReports.length
        )
      : 100;

    // Retrieve distinct years available for this class
    const availableYears = await Attendance.distinct('year', { classId });
    const currentYear = new Date().getFullYear();
    if (!availableYears.includes(currentYear)) {
      availableYears.push(currentYear);
    }
    availableYears.sort((a, b) => b - a);

    // Subject breakdown within this filtered session set
    const subjectStatsMap = {};
    sessions.forEach(sess => {
      const sId = sess.subjectId ? sess.subjectId._id.toString() : 'unknown';
      const sName = sess.subjectId ? sess.subjectId.name : 'General';
      if (!subjectStatsMap[sId]) {
        subjectStatsMap[sId] = {
          subjectId: sId,
          subjectName: sName,
          totalSessions: 0,
          presentMarks: 0,
          totalMarks: 0
        };
      }
      subjectStatsMap[sId].totalSessions++;
      subjectStatsMap[sId].presentMarks += sess.presentCount;
      subjectStatsMap[sId].totalMarks += sess.totalStudents;
    });

    const subjectBreakdown = Object.values(subjectStatsMap).map(sub => ({
      ...sub,
      averagePercentage: sub.totalMarks > 0
        ? Math.round((sub.presentMarks / sub.totalMarks) * 100)
        : 0
    }));

    res.json({
      className: `${selectedClass.name} - ${selectedClass.section}`,
      totalStudents: students.length,
      totalSessions,
      classAverage,
      filtersApplied: {
        classId,
        subjectId: subjectId || 'all',
        year: year || 'all',
        month: month || 'all'
      },
      availableYears,
      subjectBreakdown,
      studentReports
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Export route for reports
router.get('/export-csv', async (req, res) => {
  try {
    const { classId, subjectId, year, month } = req.query;
    if (!classId) return res.status(400).send('classId required');

    const selectedClass = await Class.findById(classId);
    if (!selectedClass) return res.status(404).send('Class not found');

    const query = { classId };
    if (subjectId && subjectId !== 'all') query.subjectId = subjectId;
    if (year && year !== 'all') query.year = parseInt(year, 10);
    if (month && month !== 'all') query.month = parseInt(month, 10);

    const sessions = await Attendance.find(query);
    const students = await Student.find({ classId, isActive: true }).sort({ rollNo: 1 });
    const totalSessions = sessions.length;

    let csv = 'Roll No,Student Name,Gender,Total Sessions,Present Days,Absent Days,Late Days,Attendance Percentage,Status\n';

    students.forEach(st => {
      let present = 0;
      let absent = 0;
      let late = 0;

      sessions.forEach(sess => {
        const rec = sess.records.find(r => r.studentId && r.studentId.toString() === st._id.toString());
        if (rec) {
          if (rec.status === 'present') present++;
          else if (rec.status === 'absent') absent++;
          else if (rec.status === 'late') late++;
        }
      });

      const pct = totalSessions > 0 ? Math.round(((present + (late * 0.5)) / totalSessions) * 100) : 100;
      let status = 'Good';
      if (pct < 60) status = 'Critical';
      else if (pct < 75) status = 'Warning';

      csv += `"${st.rollNo}","${st.name}","${st.gender}",${totalSessions},${present},${absent},${late},${pct}%,"${status}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${selectedClass.name}-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;
