const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Attendance = require('../models/Attendance');
const { logActivity } = require('../utils/logger');
const { authenticateUser, requirePermission } = require('../middleware/authMiddleware');

// GET all classes with student and subject counts
router.get('/', async (req, res) => {
  try {
    const classes = await Class.find().sort({ name: 1, section: 1 }).lean();
    
    // Enrich with student count
    const enriched = await Promise.all(classes.map(async (cls) => {
      const studentCount = await Student.countDocuments({ classId: cls._id, isActive: true });
      const subjectCount = await Subject.countDocuments({ classes: cls._id });
      return {
        ...cls,
        studentCount,
        subjectCount
      };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single class
router.get('/:id', async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });
    const studentCount = await Student.countDocuments({ classId: cls._id, isActive: true });
    res.json({ ...cls.toObject(), studentCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE class
router.post('/', authenticateUser, requirePermission('classes.manage'), async (req, res) => {
  try {
    const { name, section, academicYear, description, user } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Class name is required' });
    }

    const newClass = new Class({
      name: name.trim(),
      section: (section || 'A').trim().toUpperCase(),
      academicYear: academicYear || new Date().getFullYear().toString(),
      description: description || ''
    });

    await newClass.save();
    await logActivity('CLASS_CREATED', `Added new class: ${newClass.name} - ${newClass.section}`, req.user || user);

    res.status(201).json(newClass);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE class
router.put('/:id', authenticateUser, requirePermission('classes.manage'), async (req, res) => {
  try {
    const { name, section, academicYear, description, user } = req.body;
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    if (name) cls.name = name.trim();
    if (section !== undefined) cls.section = section.trim().toUpperCase();
    if (academicYear) cls.academicYear = academicYear;
    if (description !== undefined) cls.description = description;

    await cls.save();
    await logActivity('CLASS_UPDATED', `Updated class details: ${cls.name} - ${cls.section}`, req.user || user);

    res.json(cls);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE class
router.delete('/:id', authenticateUser, requirePermission('classes.manage'), async (req, res) => {
  try {
    const { user } = req.body;
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    // Remove student associations or check if class has students
    const studentCount = await Student.countDocuments({ classId: cls._id });
    if (studentCount > 0) {
      // Optional: Delete or unlink students
      await Student.deleteMany({ classId: cls._id });
    }

    // Unlink from subjects
    await Subject.updateMany({ classes: cls._id }, { $pull: { classes: cls._id } });

    // Delete attendance records for this class
    await Attendance.deleteMany({ classId: cls._id });

    await Class.findByIdAndDelete(req.params.id);
    await logActivity('CLASS_DELETED', `Deleted class ${cls.name} (${cls.section}) and associated students`, req.user || user);

    res.json({ success: true, message: `Class ${cls.name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
