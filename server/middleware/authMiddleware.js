const User = require('../models/User');
const { verifyAuthToken, normalizeEmail } = require('../utils/authHelper');

/**
 * Middleware: Authenticates the current user session.
 * Loads the user's current account directly from the database to ensure
 * role changes, permission modifications, or suspensions take effect immediately!
 */
async function authenticateUser(req, res, next) {
  try {
    let resolvedUserId = null;
    let resolvedEmail = null;

    // 1. Try Bearer token in Authorization header
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const payload = verifyAuthToken(token);
      if (payload && payload.sub) {
        resolvedUserId = payload.sub;
      }
    }

    // 2. Try custom X-Auth-Token header
    if (!resolvedUserId && req.headers['x-auth-token']) {
      const payload = verifyAuthToken(req.headers['x-auth-token']);
      if (payload && payload.sub) {
        resolvedUserId = payload.sub;
      }
    }

    // 3. Backward-compatibility: Check X-User-Id header or body.user
    if (!resolvedUserId && req.headers['x-user-id']) {
      resolvedUserId = req.headers['x-user-id'].trim();
    }
    if (!resolvedUserId && req.body && req.body.user) {
      if (req.body.user.id || req.body.user._id) {
        resolvedUserId = (req.body.user.id || req.body.user._id).toString();
      } else if (req.body.user.email) {
        resolvedEmail = normalizeEmail(req.body.user.email);
      }
    }

    if (!resolvedUserId && !resolvedEmail) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    // Fetch fresh user record from the database/store
    let user = null;
    if (resolvedUserId) {
      user = await User.findById(resolvedUserId);
      if (!user) {
        user = await User.findOne({ userId: resolvedUserId });
      }
    }
    if (!user && resolvedEmail) {
      user = await User.findOne({ email: resolvedEmail });
    }

    if (!user) {
      return res.status(401).json({ error: 'User session invalid or account does not exist. Please sign in again.' });
    }

    // Check account status (suspended accounts cannot access protected APIs)
    if (user.isActive === false) {
      return res.status(403).json({ 
        error: 'Your account has been suspended by an administrator. Please contact school administration.' 
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth Middleware Error]:', err);
    res.status(500).json({ error: 'Internal authentication error' });
  }
}

/**
 * Optional authentication middleware:
 * If an auth token is provided, loads the user; otherwise proceeds with req.user = null.
 */
async function optionalAuthenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token = null;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-auth-token']) {
      token = req.headers['x-auth-token'];
    }

    if (token) {
      const payload = verifyAuthToken(token);
      if (payload && payload.sub) {
        const user = await User.findById(payload.sub);
        if (user && user.isActive !== false) {
          req.user = user;
        }
      }
    }
    next();
  } catch (_) {
    next();
  }
}

/**
 * Middleware: Requires the authenticated user to be the primary Super Admin.
 */
function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ 
      error: 'Access denied. This administrative action requires Super Admin authority.' 
    });
  }

  next();
}

/**
 * Middleware: Requires the authenticated user to be an Admin (super_admin or custom admin).
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Access denied. Administrative role required.' 
    });
  }

  next();
}

/**
 * Middleware Factory: Requires a specific permission or Super Admin status.
 * Evaluates against the server-side user record in real-time.
 */
function requirePermission(requiredPermission) {
  return function(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Super Admin has all permissions unconditionally
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Custom Admin: Check explicit permissions
    if (req.user.role === 'admin') {
      const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      if (permissions.includes('*') || permissions.includes(requiredPermission)) {
        return next();
      }
      return res.status(403).json({ 
        error: `Access denied. You do not have the required permission: "${requiredPermission}".` 
      });
    }

    // Normal User: Check if normal users have this permission (e.g. view only)
    if (req.user.role === 'user') {
      const permissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];
      if (permissions.includes(requiredPermission)) {
        return next();
      }
      return res.status(403).json({ 
        error: `Access denied. You do not have permission to perform this action (${requiredPermission}).` 
      });
    }

    return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  };
}

module.exports = {
  authenticateUser,
  optionalAuthenticateUser,
  requireSuperAdmin,
  requireAdmin,
  requirePermission
};
