const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');
const Attendance = require('../models/Attendance');
const { logActivity } = require('../utils/logger');
const { authenticateUser, requirePermission } = require('../middleware/authMiddleware');

// GET all subjects
router.get('/', async (req, res) => {
  try {
    const subjects = await Subject.find().populate('classes', 'name section').sort({ name: 1 });
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET subjects for a specific class (or all general subjects)
router.get('/by-class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    let query = {};
    if (classId && classId !== 'all') {
      // Find subjects mapped to this class, or subjects with empty classes array (meaning applicable to all)
      query = {
        $or: [
          { classes: classId },
          { classes: { $size: 0 } },
          { classes: { $exists: false } }
        ]
      };
    }
    const subjects = await Subject.find(query).sort({ name: 1 });
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE subject
router.post('/', authenticateUser, requirePermission('subjects.manage'), async (req, res) => {
  try {
    const { name, code, classes, user } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Subject name is required' });
    }

    const subject = new Subject({
      name: name.trim(),
      code: (code || '').trim().toUpperCase(),
      classes: Array.isArray(classes) ? classes : []
    });

    await subject.save();
    await logActivity('SUBJECT_CREATED', `Added new subject: ${subject.name} (${subject.code || 'No code'})`, req.user || user);

    const populated = await Subject.findById(subject._id).populate('classes', 'name section');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE subject
router.put('/:id', authenticateUser, requirePermission('subjects.manage'), async (req, res) => {
  try {
    const { name, code, classes, user } = req.body;
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    if (name) subject.name = name.trim();
    if (code !== undefined) subject.code = code.trim().toUpperCase();
    if (Array.isArray(classes)) subject.classes = classes;

    await subject.save();
    await logActivity('SUBJECT_UPDATED', `Updated subject: ${subject.name}`, req.user || user);

    const populated = await Subject.findById(subject._id).populate('classes', 'name section');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE subject
router.delete('/:id', authenticateUser, requirePermission('subjects.manage'), async (req, res) => {
  try {
    const { user } = req.body;
    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    // Clean up attendance records for this subject
    await Attendance.deleteMany({ subjectId: subject._id });

    await Subject.findByIdAndDelete(req.params.id);
    await logActivity('SUBJECT_DELETED', `Deleted subject: ${subject.name}`, req.user || user);

    res.json({ success: true, message: `Subject ${subject.name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
