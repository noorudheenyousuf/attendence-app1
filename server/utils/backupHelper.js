const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Backup = require('../models/Backup');
const { logActivity } = require('./logger');

const BACKUP_DIR = path.join(__dirname, '../backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch (err) {
    console.warn('[Backup] Notice: could not create backups directory:', err.message);
  }
}

function cleanDoc(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete obj.__v;
  return obj;
}

/**
 * Creates a timestamped backup of the current school data.
 * Persists to both Backup collection/store and filesystem.
 */
async function createBackup({
  name,
  reason = 'manual',
  createdBy = { name: 'Admin', role: 'admin' },
  classes = null,
  subjects = null,
  students = null,
  attendances = null
} = {}) {
  const currentClasses = classes || (await Class.find().lean()).map(cleanDoc);
  const currentSubjects = subjects || (await Subject.find().lean()).map(cleanDoc);
  const currentStudents = students || (await Student.find().lean()).map(cleanDoc);
  const currentAttendances = attendances || (await Attendance.find().lean()).map(cleanDoc);

  const timestamp = new Date();
  const backupName = name || `Backup - ${timestamp.toISOString().replace(/[:.]/g, '-')}`;

  const backupData = {
    name: backupName,
    reason,
    timestamp,
    createdBy: {
      name: createdBy.name || 'Admin',
      email: createdBy.email || '',
      role: createdBy.role || 'admin'
    },
    classes: currentClasses,
    subjects: currentSubjects,
    students: currentStudents,
    attendances: currentAttendances,
    counts: {
      classes: currentClasses.length,
      subjects: currentSubjects.length,
      students: currentStudents.length,
      attendances: currentAttendances.length
    },
    createdAt: timestamp
  };

  // 1. Save into Backup collection
  const savedBackup = await Backup.create(backupData);

  // 2. Persist to disk as JSON file for extra disaster recovery
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const safeFilename = `backup_${savedBackup._id || Date.now()}_${reason}_${timestamp.getTime()}.json`;
    const filePath = path.join(BACKUP_DIR, safeFilename);
    await fs.promises.writeFile(filePath, JSON.stringify(backupData, null, 2), 'utf8');
  } catch (fsErr) {
    console.warn('[Backup] File dump warning:', fsErr.message);
  }

  await logActivity(
    'BACKUP_CREATED',
    `Backup "${backupName}" created (${backupData.counts.classes} classes, ${backupData.counts.students} students, ${backupData.counts.attendances} attendances). Reason: ${reason}`,
    createdBy,
    { backupId: savedBackup._id, counts: backupData.counts }
  );

  return savedBackup;
}

/**
 * Validates the structure and content of a backup payload.
 */
function validateBackupData(raw) {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Backup content is empty or not a valid JSON object.' };
  }

  // Support both wrapped ({ data: { classes: ... } }) and flat ({ classes: ... }) formats
  const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;

  if (!Array.isArray(data.classes)) {
    return { valid: false, error: 'Invalid backup: missing "classes" array.' };
  }
  if (!Array.isArray(data.subjects)) {
    return { valid: false, error: 'Invalid backup: missing "subjects" array.' };
  }
  if (!Array.isArray(data.students)) {
    return { valid: false, error: 'Invalid backup: missing "students" array.' };
  }
  if (!Array.isArray(data.attendances)) {
    return { valid: false, error: 'Invalid backup: missing "attendances" array.' };
  }

  // Validate Class items
  for (let i = 0; i < data.classes.length; i++) {
    const c = data.classes[i];
    if (!c || typeof c !== 'object' || !c.name || typeof c.name !== 'string' || !c.name.trim()) {
      return { valid: false, error: `Invalid class at index ${i}: class must have a valid name.` };
    }
  }

  // Validate Subject items
  for (let i = 0; i < data.subjects.length; i++) {
    const s = data.subjects[i];
    if (!s || typeof s !== 'object' || !s.name || typeof s.name !== 'string' || !s.name.trim()) {
      return { valid: false, error: `Invalid subject at index ${i}: subject must have a valid name.` };
    }
  }

  // Validate Student items
  for (let i = 0; i < data.students.length; i++) {
    const st = data.students[i];
    if (!st || typeof st !== 'object' || !st.name || !st.rollNo) {
      return { valid: false, error: `Invalid student at index ${i}: student must have name and rollNo.` };
    }
  }

  // Validate Attendance items
  for (let i = 0; i < data.attendances.length; i++) {
    const a = data.attendances[i];
    if (!a || typeof a !== 'object' || !a.date || !Array.isArray(a.records)) {
      return { valid: false, error: `Invalid attendance session at index ${i}: must contain date and records array.` };
    }
  }

  return {
    valid: true,
    data: {
      classes: data.classes.map(cleanDoc),
      subjects: data.subjects.map(cleanDoc),
      students: data.students.map(cleanDoc),
      attendances: data.attendances.map(cleanDoc)
    }
  };
}

/**
 * Restores school data from a validated backup.
 * Takes a pre-restore safety backup first, and automatically rolls back if restoration fails!
 */
async function restoreBackupData({ backupData, user = { name: 'Admin', role: 'admin' } }) {
  // 1. Validate the incoming backup data before modifying anything
  const validation = validateBackupData(backupData);
  if (!validation.valid) {
    throw new Error(`Backup validation error: ${validation.error}`);
  }

  const { classes, subjects, students, attendances } = validation.data;

  // 2. Snapshot current state for disaster rollback & safety backup
  const snapshotClasses = (await Class.find().lean()).map(cleanDoc);
  const snapshotSubjects = (await Subject.find().lean()).map(cleanDoc);
  const snapshotStudents = (await Student.find().lean()).map(cleanDoc);
  const snapshotAttendances = (await Attendance.find().lean()).map(cleanDoc);

  let preRestoreBackup = null;
  try {
    preRestoreBackup = await createBackup({
      name: `Safety backup before restore (${new Date().toLocaleString()})`,
      reason: 'pre-restore',
      createdBy: user,
      classes: snapshotClasses,
      subjects: snapshotSubjects,
      students: snapshotStudents,
      attendances: snapshotAttendances
    });
  } catch (preErr) {
    throw new Error(`Failed to create pre-restore safety backup: ${preErr.message}. Restoration aborted; current data untouched.`);
  }

  // 3. Prepare ID Remapping if transitioning between MongoDB ObjectId and in-memory IDs
  const isMongo = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  const idMap = new Map();

  function getRemappedId(oldId) {
    if (!oldId) return undefined;
    const strId = (oldId._id || oldId).toString();
    if (idMap.has(strId)) return idMap.get(strId);

    if (isMongo) {
      if (mongoose.Types.ObjectId.isValid(strId) && strId.length === 24) {
        idMap.set(strId, new mongoose.Types.ObjectId(strId));
      } else {
        idMap.set(strId, new mongoose.Types.ObjectId());
      }
    } else {
      idMap.set(strId, strId.startsWith('mem_') ? strId : `mem_${strId}`);
    }
    return idMap.get(strId);
  }

  // Map Class IDs
  classes.forEach(c => {
    c._id = getRemappedId(c._id);
  });

  // Map Subject IDs and their classes array
  subjects.forEach(s => {
    s._id = getRemappedId(s._id);
    if (Array.isArray(s.classes)) {
      s.classes = s.classes.map(cid => getRemappedId(cid)).filter(Boolean);
    }
  });

  // Map Student IDs and their classId
  students.forEach(st => {
    st._id = getRemappedId(st._id);
    st.classId = getRemappedId(st.classId);
  });

  // Map Attendance IDs, classId, subjectId, and record studentIds
  attendances.forEach(att => {
    att._id = getRemappedId(att._id);
    att.classId = getRemappedId(att.classId);
    att.subjectId = getRemappedId(att.subjectId);
    if (Array.isArray(att.records)) {
      att.records = att.records.map(rec => ({
        ...rec,
        studentId: getRemappedId(rec.studentId)
      }));
    }
  });

  // 4. Execute deletion and reinsertion with transactional rollback protection
  try {
    await Attendance.deleteMany({});
    await Student.deleteMany({});
    await Subject.deleteMany({});
    await Class.deleteMany({});

    if (classes.length > 0) {
      await Class.insertMany(classes);
    }
    if (subjects.length > 0) {
      await Subject.insertMany(subjects);
    }
    if (students.length > 0) {
      await Student.insertMany(students);
    }
    if (attendances.length > 0) {
      await Attendance.insertMany(attendances);
    }

    await logActivity(
      'BACKUP_RESTORED',
      `Backup restored successfully: ${classes.length} classes, ${subjects.length} subjects, ${students.length} students, ${attendances.length} attendance records.`,
      user,
      {
        preRestoreBackupId: preRestoreBackup._id,
        counts: { classes: classes.length, subjects: subjects.length, students: students.length, attendances: attendances.length }
      }
    );

    return {
      success: true,
      message: 'Backup restored successfully.',
      preRestoreBackupId: preRestoreBackup._id,
      counts: {
        classes: classes.length,
        subjects: subjects.length,
        students: students.length,
        attendances: attendances.length
      }
    };
  } catch (insertErr) {
    console.error('[Restore Error] Restoration failed, initiating emergency rollback to pre-restore snapshot:', insertErr);

    // Rollback from snapshot
    try {
      await Attendance.deleteMany({});
      await Student.deleteMany({});
      await Subject.deleteMany({});
      await Class.deleteMany({});

      if (snapshotClasses.length > 0) await Class.insertMany(snapshotClasses);
      if (snapshotSubjects.length > 0) await Subject.insertMany(snapshotSubjects);
      if (snapshotStudents.length > 0) await Student.insertMany(snapshotStudents);
      if (snapshotAttendances.length > 0) await Attendance.insertMany(snapshotAttendances);

      console.log('[Restore Rollback] Successfully rolled back to previous state. School data preserved.');
    } catch (rollbackErr) {
      console.error('[Restore Critical Error] Rollback error:', rollbackErr);
    }

    throw new Error(`Restoration failed during database write: ${insertErr.message}. All original data has been safely preserved and rolled back.`);
  }
}

/**
 * Appends demo classes, subjects, students and attendance sessions WITHOUT deleting existing data.
 */
async function appendDemoData(user = { name: 'Admin', role: 'admin' }) {
  const currentCount = await Class.countDocuments();
  const suffix = currentCount > 0 ? ` [Demo ${currentCount + 1}]` : ' [Demo]';

  // 1. Create Demo Classes
  const classA = await Class.create({
    name: `Grade 10${suffix}`,
    section: 'A',
    academicYear: '2026',
    description: 'Demo Secondary Science & Maths'
  });

  const classB = await Class.create({
    name: `Grade 9${suffix}`,
    section: 'A',
    academicYear: '2026',
    description: 'Demo Junior High'
  });

  // 2. Create Demo Subjects
  const math = await Subject.create({
    name: `Mathematics${suffix}`,
    code: `DMATH${currentCount + 1}`,
    classes: [classA._id, classB._id]
  });

  const science = await Subject.create({
    name: `Science & Physics${suffix}`,
    code: `DSCI${currentCount + 1}`,
    classes: [classA._id]
  });

  // 3. Create Demo Students
  const demoStudentsList = [
    { name: 'Amina Al-Hajar', rollNo: `D10-${currentCount}01`, gender: 'Female', parentContact: '+1 555-0101', parentName: 'Fatima Al-Hajar', email: 'amina.demo@example.com' },
    { name: 'Bilal Tariq', rollNo: `D10-${currentCount}02`, gender: 'Male', parentContact: '+1 555-0102', parentName: 'Tariq Mansoor', email: 'bilal.demo@example.com' },
    { name: 'Chirag Sharma', rollNo: `D10-${currentCount}03`, gender: 'Male', parentContact: '+1 555-0103', parentName: 'Raj Sharma', email: 'chirag.demo@example.com' },
    { name: 'Diana Prince', rollNo: `D10-${currentCount}04`, gender: 'Female', parentContact: '+1 555-0104', parentName: 'Hippolyta Prince', email: 'diana.demo@example.com' },
    { name: 'Ebrahim Zaid', rollNo: `D10-${currentCount}05`, gender: 'Male', parentContact: '+1 555-0105', parentName: 'Zaid Omar', email: 'ebrahim.demo@example.com' }
  ];

  const createdStudents = [];
  for (const s of demoStudentsList) {
    createdStudents.push(await Student.create({ ...s, classId: classA._id }));
  }

  // 4. Create sample attendance
  const today = new Date();
  const dates = [];
  for (let i = 5; i >= 0; i--) {
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

    const mathRecords = createdStudents.map((st, idx) => {
      let status = 'present';
      if (idx === 2) status = 'absent';
      else if (idx === 4) status = 'late';
      return { studentId: st._id, status, remarks: status === 'absent' ? 'Demo Sick leave' : '' };
    });

    await Attendance.create({
      date: dStr,
      year,
      month,
      classId: classA._id,
      subjectId: math._id,
      markedByName: user.name || 'Demo Teacher',
      records: mathRecords,
      totalStudents: mathRecords.length,
      presentCount: mathRecords.filter(r => r.status === 'present').length,
      absentCount: mathRecords.filter(r => r.status === 'absent').length,
      lateCount: mathRecords.filter(r => r.status === 'late').length
    });
  }

  await logActivity(
    'DEMO_DATA_APPENDED',
    `Appended demo data without touching existing records (2 classes, 2 subjects, 5 students, ${dates.length} attendance sessions).`,
    user
  );

  return {
    success: true,
    mode: 'append',
    message: 'Demo records successfully added without deleting your existing data.',
    classesCreated: 2,
    subjectsCreated: 2,
    studentsCreated: createdStudents.length,
    sessionsCreated: dates.length
  };
}

module.exports = {
  createBackup,
  validateBackupData,
  restoreBackupData,
  appendDemoData,
  BACKUP_DIR
};
