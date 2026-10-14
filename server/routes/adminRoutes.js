const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Activity = require('../models/Activity');
const { logActivity } = require('../utils/logger');
const {
  PERMISSION_CATEGORIES,
  VALID_PERMISSIONS,
  validatePermissionsArray
} = require('../config/permissions');
const {
  authenticateUser,
  requireSuperAdmin,
  requirePermission
} = require('../middleware/authMiddleware');
const { sanitizeUser } = require('../utils/authHelper');

// -------------------------------------------------------------
// 1. Get Permission Registry
// -------------------------------------------------------------
router.get('/permissions', authenticateUser, (req, res) => {
  res.json({
    categories: PERMISSION_CATEGORIES,
    allPermissions: VALID_PERMISSIONS
  });
});

// -------------------------------------------------------------
// 2. View Paginated Users List
// -------------------------------------------------------------
router.get('/users', authenticateUser, requirePermission('users.view'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.q || '').trim();
    const roleFilter = (req.query.role || 'all').trim();
    const statusFilter = (req.query.status || 'all').trim();

    const query = {};

    // Search by name, email, or userId
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { userId: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by role
    if (roleFilter !== 'all') {
      query.role = roleFilter;
    }

    // Filter by status
    if (statusFilter === 'active') {
      query.isActive = true;
    } else if (statusFilter === 'suspended') {
      query.isActive = false;
    }

    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit) || 1;

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      users: users.map(sanitizeUser),
      pagination: {
        page,
        limit,
        totalUsers,
        totalPages
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. View Single User Details
// -------------------------------------------------------------
router.get('/users/:id', authenticateUser, requirePermission('users.view'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. Promote User to Custom Admin
// -------------------------------------------------------------
router.post('/users/:id/promote', authenticateUser, requirePermission('admins.manage'), async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (targetUser.role === 'super_admin') {
      return res.status(400).json({ error: 'User is already Super Admin.' });
    }

    if (targetUser.role === 'admin') {
      return res.status(400).json({ error: 'User is already an Admin.' });
    }

    // Validate optional initial permissions
    const requestedPermissions = req.body.permissions || [];
    if (!validatePermissionsArray(requestedPermissions)) {
      return res.status(400).json({ error: 'Invalid permissions provided. Please select valid feature permissions.' });
    }

    // Prevent non-super_admins from granting admin management permissions unless explicitly permitted
    if (req.user.role !== 'super_admin') {
      if (requestedPermissions.some(p => p.startsWith('admins.'))) {
        return res.status(403).json({ error: 'Only Super Admin can grant Admin Management permissions.' });
      }
    }

    targetUser.role = 'admin';
    targetUser.permissions = requestedPermissions;
    await targetUser.save();

    await logActivity(
      'USER_PROMOTED_TO_ADMIN',
      `${req.user.name} (${req.user.role}) promoted ${targetUser.name} (${targetUser.email}) to Custom Admin with ${requestedPermissions.length} permission(s).`,
      req.user,
      {
        targetUserId: targetUser._id,
        targetEmail: targetUser.email,
        assignedPermissions: requestedPermissions
      }
    );

    res.json({
      success: true,
      message: `${targetUser.name} promoted to Custom Admin successfully.`,
      user: sanitizeUser(targetUser)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. Demote Custom Admin to Normal User
// -------------------------------------------------------------
router.post('/users/:id/demote', authenticateUser, requirePermission('admins.manage'), async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Critical Security Protection: Super Admin cannot be demoted
    if (targetUser.role === 'super_admin' || targetUser.isSuperAdminProtected) {
      return res.status(403).json({ error: 'Security Protection: The primary Super Admin cannot be demoted.' });
    }

    // Self-demotion protection
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot demote your own account.' });
    }

    if (targetUser.role === 'user') {
      return res.status(400).json({ error: 'User is already a normal user.' });
    }

    targetUser.role = 'user';
    targetUser.permissions = [];
    await targetUser.save();

    await logActivity(
      'ADMIN_DEMOTED_TO_USER',
      `${req.user.name} (${req.user.role}) demoted ${targetUser.name} (${targetUser.email}) to normal user. All administrative permissions were revoked.`,
      req.user,
      {
        targetUserId: targetUser._id,
        targetEmail: targetUser.email
      }
    );

    res.json({
      success: true,
      message: `${targetUser.name} demoted to normal user successfully.`,
      user: sanitizeUser(targetUser)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. Assign / Update Individual Feature Permissions (CORE REQUIREMENT)
// -------------------------------------------------------------
router.patch('/users/:id/permissions', authenticateUser, requirePermission('admins.manage'), async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Super Admin has all permissions unconditionally
    if (targetUser.role === 'super_admin') {
      return res.status(400).json({ error: 'Super Admin holds universal administrative authority; individual permissions cannot be restricted.' });
    }

    // Cannot modify permissions if target is not an admin
    if (targetUser.role !== 'admin') {
      return res.status(400).json({ error: 'Permissions can only be configured for Custom Admins. Promote this user to Admin first.' });
    }

    // Prevent Custom Admins from modifying their own permissions
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(403).json({ error: 'You cannot modify your own administrative permissions.' });
    }

    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ error: 'Permissions must be provided as an array.' });
    }

    // Validate that every single permission exists in the server permission registry
    if (!validatePermissionsArray(permissions)) {
      return res.status(400).json({ error: 'One or more invalid permission identifiers were provided.' });
    }

    // If the operator is not Super Admin, they cannot grant permissions they do not possess
    if (req.user.role !== 'super_admin') {
      const actorPerms = req.user.permissions || [];
      const hasUnpossessed = permissions.some(p => !actorPerms.includes(p));
      if (hasUnpossessed) {
        return res.status(403).json({ error: 'You cannot grant permissions that your own account does not possess.' });
      }
    }

    const previousPermissions = [...(targetUser.permissions || [])];
    targetUser.permissions = permissions;
    await targetUser.save();

    await logActivity(
      'ADMIN_PERMISSIONS_UPDATED',
      `Updated permissions for ${targetUser.name} (${targetUser.email}). Now has ${permissions.length} permission(s).`,
      req.user,
      {
        targetUserId: targetUser._id,
        targetEmail: targetUser.email,
        previousPermissions,
        newPermissions: permissions
      }
    );

    res.json({
      success: true,
      message: `Permissions updated successfully for ${targetUser.name}.`,
      user: sanitizeUser(targetUser)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. Update User Account Status (Suspend / Activate)
// -------------------------------------------------------------
router.patch('/users/:id/status', authenticateUser, requirePermission('users.edit'), async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Critical Security Protection: Super Admin cannot be suspended
    if (targetUser.role === 'super_admin' || targetUser.isSuperAdminProtected) {
      return res.status(403).json({ error: 'Security Protection: The Super Admin account cannot be suspended.' });
    }

    // Cannot suspend oneself
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot suspend your own account.' });
    }

    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive boolean field is required.' });
    }

    targetUser.isActive = isActive;
    await targetUser.save();

    await logActivity(
      isActive ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
      `${req.user.name} ${isActive ? 'activated' : 'suspended'} account: ${targetUser.name} (${targetUser.email})`,
      req.user,
      {
        targetUserId: targetUser._id,
        targetEmail: targetUser.email,
        isActive
      }
    );

    res.json({
      success: true,
      message: `User ${targetUser.name} ${isActive ? 'activated' : 'suspended'} successfully.`,
      user: sanitizeUser(targetUser)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 8. Delete User Account
// -------------------------------------------------------------
router.delete('/users/:id', authenticateUser, requirePermission('users.delete'), async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Critical Security Protection: Super Admin cannot be deleted
    if (targetUser.role === 'super_admin' || targetUser.isSuperAdminProtected) {
      return res.status(403).json({ error: 'Security Protection: The primary Super Admin account cannot be deleted.' });
    }

    // Cannot delete oneself
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    await User.findByIdAndDelete(targetUser._id);

    await logActivity(
      'USER_DELETED',
      `${req.user.name} (${req.user.role}) deleted user account: ${targetUser.name} (${targetUser.email})`,
      req.user,
      {
        targetUserId: targetUser._id,
        targetEmail: targetUser.email,
        targetRole: targetUser.role
      }
    );

    res.json({
      success: true,
      message: `User ${targetUser.name} has been deleted.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 9. View Audit Logs
// -------------------------------------------------------------
router.get('/audit-logs', authenticateUser, requirePermission('settings.view'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));

    const totalLogs = await Activity.countDocuments();
    const totalPages = Math.ceil(totalLogs / limit) || 1;

    const logs = await Activity.find()
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        totalLogs,
        totalPages
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
