require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const connectDB = require('./config/db');

// Route imports
const authRoutes = require('./routes/authRoutes');
const classRoutes = require('./routes/classRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const studentRoutes = require('./routes/studentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingRoutes = require('./routes/settingRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Static files (frontend)
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  const isDbConnected = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  res.json({
    status: 'ok',
    app: 'Hajar App',
    databaseConnected: isDbConnected,
    databaseMode: isDbConnected ? 'mongodb' : 'memory',
    timestamp: new Date()
  });
});

// Single Page Application fallback (Compatible with Express 4 & 5)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  }
  next();
});

// Seed helper
async function autoSeedIfEmpty() {
  try {
    const Class = require('./models/Class');
    const classCount = await Class.countDocuments();
    if (classCount === 0) {
      console.log('[Hajar App] First-time launch detected! Auto-seeding initial school data...');
      
      const Student = require('./models/Student');
      const Subject = require('./models/Subject');
      const Attendance = require('./models/Attendance');
      const { logActivity } = require('./utils/logger');

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
        createdStudents.push(await Student.create({ ...s, classId: classA._id }));
      }

      // Add realistic past attendance records
      const today = new Date();
      for (let i = 7; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dStr = `${yyyy}-${mm}-${dd}`;

          const records = createdStudents.map((st, idx) => {
            let status = 'present';
            if (idx === 3 && i === 2) status = 'absent';
            else if (idx === 5 && i === 4) status = 'late';
            return { studentId: st._id, status, remarks: status === 'absent' ? 'Sick leave' : '' };
          });

          await Attendance.create({
            date: dStr,
            year: yyyy,
            month: parseInt(mm, 10),
            classId: classA._id,
            subjectId: math._id,
            markedByName: 'Prof. Noorudheen',
            records,
            totalStudents: records.length,
            presentCount: records.filter(r => r.status === 'present').length,
            absentCount: records.filter(r => r.status === 'absent').length,
            lateCount: records.filter(r => r.status === 'late').length
          });
        }
      }

      await logActivity('SYSTEM_INIT', 'First-time setup initialized with sample classes, subjects, and students');
      console.log('[Hajar App] Auto-seeding complete! Ready for immediate use.');
    }
  } catch (err) {
    console.error('[Hajar App] Auto-seed note:', err.message);
  }
}

// Start Server
const startServer = async () => {
  const isConnected = await connectDB();
  if (isConnected) {
    if (authRoutes.seedDefaultUsers) {
      await authRoutes.seedDefaultUsers();
    }
    await autoSeedIfEmpty();
  } else {
    console.log('[Hajar App] Zero-downtime In-Memory Mode active. Demo accounts (admin/teacher) and default classes are ready for immediate use.');
  }

  const server = app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`  HAJAR APP - School Attendance System  `);
    console.log(`  Running on: http://localhost:${PORT}   `);
    console.log(`=========================================`);
  });

  return server;
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
