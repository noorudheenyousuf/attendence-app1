const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'hajar_secure_secret_key_2026_super_admin';

/**
 * Normalizes email address safely (lowercased, trimmed).
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Generates a tamper-proof signed authorization token for a user session.
 */
function generateAuthToken(user) {
  if (!user) return null;
  const userIdStr = (user._id || user.id || '').toString();
  const payload = {
    sub: userIdStr,
    userId: user.userId || '',
    email: normalizeEmail(user.email),
    role: user.role || 'user',
    iat: Date.now()
  };

  const dataStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(dataStr).digest('base64url');
  return `${dataStr}.${signature}`;
}

/**
 * Cryptographically verifies an authorization token and returns the payload if valid.
 */
function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [dataStr, signature] = parts;
  try {
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(dataStr).digest('base64url');
    
    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(dataStr, 'base64url').toString('utf8'));
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Returns a sanitized user object without sensitive fields (e.g. password).
 */
function sanitizeUser(user) {
  if (!user) return null;
  const obj = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete obj.password;
  delete obj.__v;

  return {
    id: obj._id ? obj._id.toString() : obj.id,
    userId: obj.userId,
    name: obj.name,
    email: obj.email,
    avatar: obj.avatar || '',
    role: obj.role || 'user',
    permissions: Array.isArray(obj.permissions) ? obj.permissions : [],
    isActive: obj.isActive !== false,
    isSuperAdminProtected: Boolean(obj.isSuperAdminProtected),
    createdAt: obj.createdAt,
    lastLogin: obj.lastLogin
  };
}

module.exports = {
  normalizeEmail,
  generateAuthToken,
  verifyAuthToken,
  sanitizeUser
};
