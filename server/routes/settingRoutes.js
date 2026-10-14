const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Activity = require('../models/Activity');
const User = require('../models/User');
const Backup = require('../models/Backup');
const { logActivity } = require('../utils/logger');
const { authenticateUser, requirePermission } = require('../middleware/authMiddleware');
const {
  createBackup,
  validateBackupData,
  restoreBackupData,
  appendDemoData
} = require('../utils/backupHelper');

// GET system stats & summary
router.get('/stats', async (req, res) => {
  try {
    const [
      totalStudents,
      totalClasses,
      totalSubjects,
      totalAttendanceSessions,
      totalActivities,
      totalBackups
    ] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      Class.countDocuments(),
      Subject.countDocuments(),
      Attendance.countDocuments(),
      Activity.countDocuments(),
      Backup.countDocuments()
    ]);

    const mongoState = mongoose.connection ? mongoose.connection.readyState : 0;
    const isPersistent = mongoState === 1;
    const dbStatus = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'][mongoState] || 'Disconnected';

    res.json({
      totalStudents,
      totalClasses,
      totalSubjects,
      totalAttendanceSessions,
      totalActivities,
      totalBackups,
      dbStatus,
      isPersistent,
      databaseMode: isPersistent ? 'mongodb' : 'memory',
      persistenceWarning: isPersistent
        ? null
        : 'In-Memory storage mode active. Changes are stored in temporary RAM and will be lost if the server restarts. Real school data requires MongoDB.',
      version: '1.0.0',
      appName: 'Hajar App'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET activities log
router.get('/activities', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const activities = await Activity.find().sort({ timestamp: -1 }).limit(limit);
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CLEAR ATTENDANCE DATA ONLY
router.delete('/clear-attendance', authenticateUser, requirePermission('attendance.clear'), async (req, res) => {
  try {
    const { user, classId } = req.body;
    let query = {};
    let message = 'All attendance records have been cleared successfully.';

    if (classId && classId !== 'all') {
      query.classId = classId;
      message = 'Attendance records for the selected class have been cleared.';
    }

    const count = await Attendance.countDocuments(query);
    await Attendance.deleteMany(query);

    await logActivity(
      'ATTENDANCE_CLEARED',
      `Attendance data cleared (${count} sessions deleted). Students and classes were preserved.`,
      req.user || user,
      { countDeleted: count }
    );

    res.json({
      success: true,
      message,
      countDeleted: count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESET APP BUTTON
router.post('/reset-app', authenticateUser, requirePermission('settings.manage'), async (req, res) => {
  try {
    const { user } = req.body;

    // Create an automatic safety backup before reset
    const now = new Date();
    await createBackup({
      name: `Auto-backup before factory reset (${now.toLocaleString()})`,
      reason: 'pre-reset',
      createdBy: req.user || user || { name: 'Admin', role: 'admin' }
    });

    // Delete all attendance records, students, subjects, classes
    await Attendance.deleteMany({});
    await Student.deleteMany({});
    await Subject.deleteMany({});
    await Class.deleteMany({});

    await logActivity('APP_RESET', 'Entire application data was reset to factory state by admin (safety backup was preserved)', req.user || user);

    res.json({
      success: true,
      message: 'Hajar App data has been reset to factory state. A safety backup was saved automatically.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * SEED SAMPLE DATA
 * Requirement 1: Create a backup before loading demo data. Before the seed route deletes anything,
 * copy current classes, subjects, students, and attendance records into a timestamped backup.
 * Only proceed with seeding if the backup succeeds; otherwise, return an error and leave data untouched.
 * Requirement 4: Support appending demo records without deleting current data.
 */
router.post('/seed-sample', authenticateUser, requirePermission('settings.manage'), async (req, res) => {
  try {
    const { user, mode = 'replace' } = req.body;

    // Handle append mode (doesn't overwrite real data)
    if (mode === 'append') {
      const appendResult = await appendDemoData(req.user || user);
      return res.json(appendResult);
    }

    // Replace mode:
    // Step 1: Copy current data into a timestamped backup BEFORE deleting anything
    const currentClasses = await Class.find().lean();
    const currentSubjects = await Subject.find().lean();
    const currentStudents = await Student.find().lean();
    const currentAttendances = await Attendance.find().lean();

    const hasData = currentClasses.length > 0 || currentStudents.length > 0 || currentAttendances.length > 0;
    let savedBackup = null;

    if (hasData) {
      const now = new Date();
      const backupTitle = `Pre-Demo Seed Backup (${now.toISOString().replace(/[:.]/g, '-')})`;
      try {
        savedBackup = await createBackup({
          name: backupTitle,
          reason: 'pre-seed',
          createdBy: user || { name: 'Admin', role: 'admin' },
          classes: currentClasses,
          subjects: currentSubjects,
          students: currentStudents,
          attendances: currentAttendances
        });

        if (!savedBackup || !savedBackup._id) {
          throw new Error('Backup failed to return a valid identifier.');
        }
      } catch (backupErr) {
        console.error('[Seed Error] Pre-seed backup failed:', backupErr);
        // Requirement 1: Only proceed with seeding if the backup succeeds;
        // otherwise, return an error and leave the current data untouched.
        return res.status(500).json({
          success: false,
          error: `Pre-seed backup failed: ${backupErr.message}. All existing school data has been kept completely untouched. Demo seed was aborted.`
        });
      }
    }

    // Step 2: Now that backup succeeded (or was empty), wipe and seed
    await Attendance.deleteMany({});
    await Student.deleteMany({});
    await Subject.deleteMany({});
    await Class.deleteMany({});

    // 1. Create Classes
    const classA = await Class.create({
      name: 'Grade 10',
      section: 'A',
      academicYear: '2026',
      description: 'Senior Secondary Science & Maths'
    });

    const classB = await Class.create({
      name: 'Grade 10',
      section: 'B',
      academicYear: '2026',
      description: 'Senior Secondary Arts & Commerce'
    });

    const classC = await Class.create({
      name: 'Grade 9',
      section: 'A',
      academicYear: '2026',
      description: 'Junior High'
    });

    // 2. Create Subjects
    const math = await Subject.create({
      name: 'Mathematics',
      code: 'MATH101',
      classes: [classA._id, classB._id, classC._id]
    });

    const science = await Subject.create({
      name: 'Science & Physics',
      code: 'SCI102',
      classes: [classA._id, classB._id]
    });

    const english = await Subject.create({
      name: 'English Language',
      code: 'ENG103',
      classes: [classA._id, classB._id, classC._id]
    });

    const history = await Subject.create({
      name: 'World History',
      code: 'HIS104',
      classes: [classB._id, classC._id]
    });

    // 3. Create Sample Students for Grade 10-A
    const studentsData = [
      { name: 'Amina Al-Hajar', rollNo: '10A-01', gender: 'Female', parentContact: '+1 555-0101', parentName: 'Fatima Al-Hajar', email: 'amina@example.com' },
      { name: 'Bilal Tariq', rollNo: '10A-02', gender: 'Male', parentContact: '+1 555-0102', parentName: 'Tariq Mansoor', email: 'bilal@example.com' },
      { name: 'Chirag Sharma', rollNo: '10A-03', gender: 'Male', parentContact: '+1 555-0103', parentName: 'Raj Sharma', email: 'chirag@example.com' },
      { name: 'Diana Prince', rollNo: '10A-04', gender: 'Female', parentContact: '+1 555-0104', parentName: 'Hippolyta Prince', email: 'diana@example.com' },
      { name: 'Ebrahim Zaid', rollNo: '10A-05', gender: 'Male', parentContact: '+1 555-0105', parentName: 'Zaid Omar', email: 'ebrahim@example.com' },
      { name: 'Fatima Zahra', rollNo: '10A-06', gender: 'Female', parentContact: '+1 555-0106', parentName: 'Ali Raza', email: 'fatima@example.com' },
      { name: 'Ghufran Malik', rollNo: '10A-07', gender: 'Male', parentContact: '+1 555-0107', parentName: 'Malik Akbar', email: 'ghufran@example.com' },
      { name: 'Hajar Noora', rollNo: '10A-08', gender: 'Female', parentContact: '+1 555-0108', parentName: 'Noorudheen', email: 'hajar.noora@example.com' }
    ];

    const createdStudents = [];
    for (const s of studentsData) {
      const student = await Student.create({
        ...s,
        classId: classA._id
      });
      createdStudents.push(student);
    }

    // 4. Create sample attendance records
    const today = new Date();
    const dates = [];
    for (let i = 10; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dates.push(`${yyyy}-${mm}-${dd}`);
      }
    }

    for (const dStr of dates) {
      const parts = dStr.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);

      // Create attendance for Math
      const mathRecords = createdStudents.map((st, idx) => {
        let status = 'present';
        if (idx === 3 && dStr.endsWith('05')) status = 'absent';
        else if (idx === 6 && dStr.endsWith('08')) status = 'late';
        else if (idx === 1 && Math.random() < 0.2) status = 'absent';
        return { studentId: st._id, status, remarks: status === 'absent' ? 'Sick leave' : '' };
      });

      await Attendance.create({
        date: dStr,
        year,
        month,
        classId: classA._id,
        subjectId: math._id,
        markedByName: 'Prof. Noorudheen',
        records: mathRecords,
        totalStudents: mathRecords.length,
        presentCount: mathRecords.filter(r => r.status === 'present').length,
        absentCount: mathRecords.filter(r => r.status === 'absent').length,
        lateCount: mathRecords.filter(r => r.status === 'late').length
      });

      // Create attendance for Science
      const sciRecords = createdStudents.map((st, idx) => {
        let status = 'present';
        if (idx === 4 && Math.random() < 0.2) status = 'absent';
        if (idx === 2 && Math.random() < 0.15) status = 'late';
        return { studentId: st._id, status, remarks: '' };
      });

      await Attendance.create({
        date: dStr,
        year,
        month,
        classId: classA._id,
        subjectId: science._id,
        markedByName: 'Dr. Sarah',
        records: sciRecords,
        totalStudents: sciRecords.length,
        presentCount: sciRecords.filter(r => r.status === 'present').length,
        absentCount: sciRecords.filter(r => r.status === 'absent').length,
        lateCount: sciRecords.filter(r => r.status === 'late').length
      });
    }

    await logActivity('SAMPLE_DATA_SEEDED', 'Sample school data loaded: 3 classes, 4 subjects, 8 students, and 20+ attendance sessions', user);

    res.json({
      success: true,
      message: savedBackup 
        ? `Sample data loaded! Previous data safely backed up as "${savedBackup.name}".`
        : 'Sample school data seeded successfully!',
      backupCreated: Boolean(savedBackup),
      backupId: savedBackup ? savedBackup._id : null,
      backupName: savedBackup ? savedBackup.name : null,
      classesCreated: 3,
      subjectsCreated: 4,
      studentsCreated: createdStudents.length,
      sessionsCreated: dates.length * 2
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// BACKUP & RESTORE ROUTES (Requirements 1, 3)
// ==========================================

// GET all saved backups list
router.get('/backups', async (req, res) => {
  try {
    const backups = await Backup.find().sort({ timestamp: -1 });
    const formatted = backups.map(b => ({
      _id: b._id,
      name: b.name,
      reason: b.reason,
      timestamp: b.timestamp,
      counts: b.counts || {
        classes: (b.classes || []).length,
        subjects: (b.subjects || []).length,
        students: (b.students || []).length,
        attendances: (b.attendances || []).length
      },
      createdBy: b.createdBy,
      createdAt: b.createdAt
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a manual backup now
router.post('/backups', authenticateUser, requirePermission('settings.manage'), async (req, res) => {
  try {
    const { name, user } = req.body;
    const backup = await createBackup({
      name: name || `Manual Backup - ${new Date().toLocaleString()}`,
      reason: 'manual',
      createdBy: req.user || user || { name: 'Admin', role: 'admin' }
    });
    res.json({
      success: true,
      message: `Backup "${backup.name}" created successfully.`,
      backup
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// EXPORT backup file as downloadable JSON (Requirement 3: "Let an admin export a backup file")
router.get('/backups/export', async (req, res) => {
  try {
    const currentClasses = await Class.find().lean();
    const currentSubjects = await Subject.find().lean();
    const currentStudents = await Student.find().lean();
    const currentAttendances = await Attendance.find().lean();

    const timestamp = new Date();
    const dateStr = timestamp.toISOString().replace(/[:.]/g, '-');
    const filename = `hajar_backup_${dateStr}.json`;

    const payload = {
      app: 'Hajar App',
      version: '1.0.0',
      exportedAt: timestamp.toISOString(),
      counts: {
        classes: currentClasses.length,
        subjects: currentSubjects.length,
        students: currentStudents.length,
        attendances: currentAttendances.length
      },
      data: {
        classes: currentClasses,
        subjects: currentSubjects,
        students: currentStudents,
        attendances: currentAttendances
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DOWNLOAD a specific saved backup by ID as JSON
router.get('/backups/:id/download', async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id);
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    const filename = `hajar_backup_${backup.reason || 'saved'}_${new Date(backup.timestamp).getTime()}.json`;
    const payload = {
      app: 'Hajar App',
      version: '1.0.0',
      backupId: backup._id,
      name: backup.name,
      reason: backup.reason,
      timestamp: backup.timestamp,
      counts: backup.counts,
      data: {
        classes: backup.classes,
        subjects: backup.subjects,
        students: backup.students,
        attendances: backup.attendances
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESTORE backup from JSON payload (Requirement 3: "validate before changing any data, keep current safe if fails")
router.post('/backups/restore', authenticateUser, requirePermission('settings.manage'), async (req, res) => {
  try {
    const { backupData, user } = req.body;

    if (!backupData) {
      return res.status(400).json({ error: 'No backup data provided in request body.' });
    }

    const result = await restoreBackupData({ backupData, user: req.user || user });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESTORE from an existing saved backup record
router.post('/backups/:id/restore', authenticateUser, requirePermission('settings.manage'), async (req, res) => {
  try {
    const backup = await Backup.findById(req.params.id);
    if (!backup) {
      return res.status(404).json({ error: 'Backup record not found.' });
    }

    const { user } = req.body;
    const backupData = {
      classes: backup.classes,
      subjects: backup.subjects,
      students: backup.students,
      attendances: backup.attendances
    };

    const result = await restoreBackupData({ backupData, user: req.user || user });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a saved backup record
router.delete('/backups/:id', authenticateUser, requirePermission('settings.manage'), async (req, res) => {
  try {
    const backup = await Backup.findByIdAndDelete(req.params.id);
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found.' });
    }
    res.json({ success: true, message: `Backup "${backup.name}" removed.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
