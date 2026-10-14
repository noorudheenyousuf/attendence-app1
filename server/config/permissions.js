/**
 * Hajar App - Role & Permission Registry
 * Defines granular feature permissions based on actual application modules.
 */

const PERMISSION_CATEGORIES = [
  {
    id: 'attendance',
    category: 'Attendance Management',
    description: 'Daily student attendance recording and session logs',
    permissions: [
      { id: 'attendance.view', name: 'View Attendance', description: 'View daily attendance sessions and historical logs' },
      { id: 'attendance.mark', name: 'Mark & Update Attendance', description: 'Take, save, and update attendance records' },
      { id: 'attendance.delete', name: 'Delete Attendance Sessions', description: 'Delete individual attendance sessions' }
    ]
  },
  {
    id: 'classes',
    category: 'Classrooms & Sections',
    description: 'Classrooms, academic years, and sections',
    permissions: [
      { id: 'classes.view', name: 'View Classes', description: 'View list of classes and section details' },
      { id: 'classes.manage', name: 'Manage Classes', description: 'Create, update, and delete classes' }
    ]
  },
  {
    id: 'subjects',
    category: 'Curriculum & Subjects',
    description: 'Courses, subject codes, and class associations',
    permissions: [
      { id: 'subjects.view', name: 'View Subjects', description: 'View curriculum subjects and class assignments' },
      { id: 'subjects.manage', name: 'Manage Subjects', description: 'Create, update, and delete subjects' }
    ]
  },
  {
    id: 'students',
    category: 'Students Directory',
    description: 'Student enrollment and profile records',
    permissions: [
      { id: 'students.view', name: 'View Students', description: 'View student profiles, roll numbers, and attendance records' },
      { id: 'students.manage', name: 'Manage Students', description: 'Add, edit, and delete student records' }
    ]
  },
  {
    id: 'reports',
    category: 'Reports & Analytics',
    description: 'School attendance statistics and reports',
    permissions: [
      { id: 'reports.view', name: 'View Reports', description: 'View monthly and yearly attendance analytics' },
      { id: 'reports.export', name: 'Export Reports (CSV)', description: 'Export attendance logs and statistics to CSV' }
    ]
  },
  {
    id: 'users',
    category: 'User Accounts',
    description: 'Registered user accounts and access status',
    permissions: [
      { id: 'users.view', name: 'View Users', description: 'Search and view registered user accounts' },
      { id: 'users.edit', name: 'Edit & Suspend Users', description: 'Update user profiles and activate or suspend accounts' },
      { id: 'users.delete', name: 'Delete Users', description: 'Remove user accounts from the system' }
    ]
  },
  {
    id: 'settings',
    category: 'System & Backups',
    description: 'System diagnostics, database backups, and disaster recovery',
    permissions: [
      { id: 'settings.view', name: 'View Settings & Diagnostics', description: 'View system health, diagnostics, and audit logs' },
      { id: 'settings.backups_export', name: 'Export Backups', description: 'Download system backup JSON files' },
      { id: 'settings.backups_restore', name: 'Restore Backups', description: 'Restore school data from backup files with rollback safety' },
      { id: 'settings.clear_attendance', name: 'Clear Attendance', description: 'Clear attendance logs while keeping students' },
      { id: 'settings.seed_demo', name: 'Load Demo Data', description: 'Seed demo classes and students' },
      { id: 'settings.reset_app', name: 'Factory Reset App', description: 'Wipe all school data back to factory state' }
    ]
  },
  {
    id: 'admins',
    category: 'Admin & Role Management',
    description: 'Administrative role delegation and permission management (Super Admin only by default)',
    permissions: [
      { id: 'admins.view', name: 'View Admins & Roles', description: 'View administrative accounts and their assigned permissions' },
      { id: 'admins.manage', name: 'Manage Admins & Permissions', description: 'Promote users to Custom Admin, demote Admins, and configure individual permissions' }
    ]
  }
];

// Flat list of all valid permission strings
const VALID_PERMISSIONS = PERMISSION_CATEGORIES.reduce((acc, cat) => {
  return acc.concat(cat.permissions.map(p => p.id));
}, []);

// Default permissions for normal authenticated users
const DEFAULT_USER_PERMISSIONS = [
  'attendance.view',
  'classes.view',
  'subjects.view',
  'students.view',
  'reports.view'
];

function isValidPermission(permission) {
  if (permission === '*') return true;
  return VALID_PERMISSIONS.includes(permission);
}

function validatePermissionsArray(permissions) {
  if (!Array.isArray(permissions)) return false;
  return permissions.every(p => isValidPermission(p));
}

module.exports = {
  PERMISSION_CATEGORIES,
  VALID_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
  isValidPermission,
  validatePermissionsArray
};
