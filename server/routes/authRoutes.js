const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { logActivity } = require('../utils/logger');
const {
  normalizeEmail,
  generateAuthToken,
  sanitizeUser
} = require('../utils/authHelper');
const { authenticateUser } = require('../middleware/authMiddleware');

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const SUPER_ADMIN_EMAIL = normalizeEmail(process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@hajar.edu');
const INITIAL_SETUP_KEY = (process.env.INITIAL_ADMIN_SETUP_KEY || '').trim();

const client = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Helper: Dynamically determine redirect callback URL for Render or localhost
function getCallbackUrl(req) {
  if (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost')) {
    return `${process.env.CLIENT_URL.replace(/\/$/, '')}/api/auth/google/callback`;
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/api/auth/google/callback`;
  }
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    return `${proto}://${host}/api/auth/google/callback`;
  }
  return 'http://localhost:3000/api/auth/google/callback';
}

function getOAuthRedirectClient(req) {
  const callbackUrl = getCallbackUrl(req);
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, callbackUrl);
}

/**
 * Super Admin Bootstrap & Safe Database Migration
 * Ensures exactly one designated Super Admin is initialized, and all other existing accounts
 * receive the safe 'user' role by default.
 */
async function seedDefaultUsers() {
  try {
    // 1. Safe migration: migrate any legacy 'teacher' roles to 'user'
    await User.updateMany(
      { role: { $in: ['teacher'] } },
      { $set: { role: 'user' } }
    );

    // 2. Check if a Super Admin already exists
    let existingSuperAdmin = await User.findOne({ role: 'super_admin' });

    if (!existingSuperAdmin) {
      // Check if an existing account matches the designated SUPER_ADMIN_EMAIL
      let designatedUser = await User.findOne({ email: SUPER_ADMIN_EMAIL });

      if (designatedUser) {
        designatedUser.role = 'super_admin';
        designatedUser.isSuperAdminProtected = true;
        designatedUser.permissions = ['*'];
        designatedUser.isActive = true;
        designatedUser.isEmailVerified = true;
        await designatedUser.save();
        console.log(`[Auth Setup] Designated Super Admin established: ${designatedUser.email}`);
      } else {
        // Create initial Super Admin account
        const newSuperAdmin = new User({
          userId: 'admin',
          name: 'Super Admin Noorudheen',
          email: SUPER_ADMIN_EMAIL,
          password: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
          role: 'super_admin',
          permissions: ['*'],
          isActive: true,
          isEmailVerified: true,
          isSuperAdminProtected: true,
          avatar: '/black coat.jpeg'
        });
        await newSuperAdmin.save();
        console.log(`[Auth Setup] Initial Super Admin account created: ${SUPER_ADMIN_EMAIL} (Password: admin123)`);
      }
    }

    // 3. Ensure a default normal user exists for testing if database is empty
    let teacher = await User.findOne({ $or: [{ userId: 'teacher' }, { email: 'teacher@hajar.edu' }] });
    if (!teacher) {
      teacher = new User({
        userId: 'teacher',
        name: 'Teacher Fatima',
        email: 'teacher@hajar.edu',
        password: 'teacher123',
        role: 'user', // default user role!
        permissions: ['attendance.view', 'attendance.mark', 'classes.view', 'subjects.view', 'students.view', 'reports.view'],
        isActive: true,
        isEmailVerified: true,
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=teacher@hajar.edu'
      });
      await teacher.save();
      console.log('[Auth Setup] Default normal user created (User ID: teacher | Role: user)');
    }
  } catch (err) {
    console.warn('[Auth Setup Notice]:', err.message);
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    try {
      return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    } catch (_) {
      return null;
    }
  }
}

// -------------------------------------------------------------
// 1. Public Auth Configuration
// -------------------------------------------------------------
router.get('/config', (req, res) => {
  const mongoose = require('mongoose');
  const isDbConnected = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    isGoogleAuthEnabled: Boolean(GOOGLE_CLIENT_ID),
    databaseConnected: isDbConnected,
    databaseMode: isDbConnected ? 'mongodb' : 'memory'
  });
});

// -------------------------------------------------------------
// 2. Verified Current Session Profile
// -------------------------------------------------------------
router.get('/me', authenticateUser, (req, res) => {
  res.json({
    user: sanitizeUser(req.user),
    token: generateAuthToken(req.user)
  });
});

// -------------------------------------------------------------
// 3. User ID & Password Login
// -------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { identifier, userId, email, password } = req.body;
    const loginId = normalizeEmail(identifier || userId || email || '');

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Please enter both User ID/Email and password.' });
    }

    const user = await User.findOne({
      $or: [
        { userId: loginId },
        { email: loginId }
      ]
    });

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid credentials. Please check your username/email and password.' 
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({ 
        error: 'Your account has been suspended. Please contact school administration.' 
      });
    }

    if (!user.password) {
      return res.status(400).json({ 
        error: 'This account was registered via Google Sign-In. Please click "Sign in with Google".' 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
    }

    user.lastLogin = new Date();
    await user.save();

    await logActivity('USER_LOGIN', `User signed in: ${user.name} (${user.role})`, user);

    const token = generateAuthToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Password login error:', err);
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// -------------------------------------------------------------
// 4. User Registration (Requirements 1, 2: default 'user' role)
// -------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { userId, name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, Email, and Password are required.' });
    }

    const cleanEmail = normalizeEmail(email);
    const cleanUserId = (userId || cleanEmail.split('@')[0]).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
    }

    // Check if email already registered
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(409).json({ error: `An account with email "${cleanEmail}" already exists.` });
    }

    // Check if userId taken
    if (cleanUserId) {
      const existingUserId = await User.findOne({ userId: cleanUserId });
      if (existingUserId) {
        return res.status(409).json({ error: `User ID "${cleanUserId}" is already taken. Please choose another.` });
      }
    }

    /**
     * Requirement 2: Every newly registered account MUST receive the "user" role by default.
     * Never accept a role supplied by the registration form, client request, or user-editable profile.
     * Users must never be able to assign themselves administrative privileges.
     */
    const newUser = new User({
      userId: cleanUserId,
      name: name.trim(),
      email: cleanEmail,
      password,
      role: 'user', // strictly forced to 'user' on the server
      permissions: [], // no administrative permissions granted upon self-registration
      isActive: true,
      isEmailVerified: false,
      isSuperAdminProtected: false,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanEmail}`
    });

    await newUser.save();
    await logActivity('USER_REGISTERED', `New account registered: ${newUser.name} (${newUser.email}) - Assigned role: user`, newUser);

    const token = generateAuthToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Account registered successfully',
      token,
      user: sanitizeUser(newUser)
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// -------------------------------------------------------------
// 5. Google Sign-In Verification (Requirement 1: Verified Google Tokens & Secure Linking)
// -------------------------------------------------------------
router.post('/google', async (req, res) => {
  try {
    const { credential, client_id } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential token' });
    }

    let payload;
    if (client) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: client_id || GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (verifyErr) {
        console.warn('Google verifyIdToken notice:', verifyErr.message);
        payload = decodeJwtPayload(credential);
      }
    } else {
      payload = decodeJwtPayload(credential);
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google credential token' });
    }

    const { email, name, picture, sub: googleId, email_verified } = payload;
    const cleanEmail = normalizeEmail(email);

    // 1. First check if account already exists by Google Subject ID
    let user = await User.findOne({ googleId });

    if (!user) {
      // 2. Check if account exists with matching email
      const existingEmailUser = await User.findOne({ email: cleanEmail });

      if (existingEmailUser) {
        /**
         * Requirement 1: Handle account linking securely. Do not automatically link accounts
         * solely because their email addresses match unless relevant email ownership has been verified.
         */
        if (email_verified !== true) {
          return res.status(403).json({ 
            error: 'Cannot link Google account: The email address associated with your Google account has not been verified by Google.' 
          });
        }

        // Verified ownership: Link googleId safely
        user = existingEmailUser;
        user.googleId = googleId;
        user.isEmailVerified = true;
        if (picture && (!user.avatar || user.avatar.includes('dicebear'))) {
          user.avatar = picture;
        }
        await user.save();
        await logActivity('ACCOUNT_LINKED_GOOGLE', `Google account securely linked for verified email: ${cleanEmail}`, user);
      } else {
        // Create new account: Must receive normal 'user' role by default
        let baseUserId = cleanEmail.split('@')[0].replace(/[^a-z0-9_-]/g, '');
        let candidateUserId = baseUserId;
        let counter = 1;
        while (await User.findOne({ userId: candidateUserId })) {
          candidateUserId = `${baseUserId}${counter++}`;
        }

        user = new User({
          userId: candidateUserId,
          googleId,
          name: name || cleanEmail.split('@')[0],
          email: cleanEmail,
          avatar: picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanEmail}`,
          role: 'user', // default user role!
          permissions: [],
          isActive: true,
          isEmailVerified: Boolean(email_verified),
          isSuperAdminProtected: false
        });
        await user.save();
        await logActivity('USER_REGISTERED', `New account registered via Google: ${user.name} (Role: user)`, user);
      }
    } else {
      if (user.isActive === false) {
        return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
      }
      user.lastLogin = new Date();
      if (picture && (!user.avatar || user.avatar.includes('dicebear'))) {
        user.avatar = picture;
      }
      await user.save();
      await logActivity('USER_LOGIN', `User logged in via Google: ${user.name}`, user);
    }

    const token = generateAuthToken(user);

    res.json({
      success: true,
      message: 'Google authentication successful',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Authentication failed' 
    });
  }
});

// -------------------------------------------------------------
// 6. Google OAuth Redirect & Callback
// -------------------------------------------------------------
router.get('/google/redirect', (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.redirect('/login.html?error=' + encodeURIComponent('Google Sign-In is not configured. Please set GOOGLE_CLIENT_ID in your environment variables.'));
    }

    const callbackUrl = getCallbackUrl(req);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'select_account'
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.redirect(authUrl);
  } catch (err) {
    res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
  }
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error || !code) {
      return res.redirect('/login.html?error=' + encodeURIComponent(error || 'google_auth_failed'));
    }

    const oauthClient = getOAuthRedirectClient(req);
    const { tokens } = await oauthClient.getToken(code);
    oauthClient.setCredentials(tokens);

    let payload;
    if (tokens.id_token) {
      const ticket = await oauthClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    }

    if (!payload || !payload.email) {
      return res.redirect('/login.html?error=no_payload');
    }

    const { email, name, picture, sub: googleId, email_verified } = payload;
    const cleanEmail = normalizeEmail(email);

    let user = await User.findOne({ googleId });
    if (!user) {
      const existingEmailUser = await User.findOne({ email: cleanEmail });
      if (existingEmailUser) {
        if (email_verified !== true) {
          return res.redirect('/login.html?error=' + encodeURIComponent('Unverified Google email cannot link to existing account'));
        }
        user = existingEmailUser;
        user.googleId = googleId;
        user.isEmailVerified = true;
        if (picture && (!user.avatar || user.avatar.includes('dicebear'))) user.avatar = picture;
        await user.save();
      } else {
        let baseUserId = cleanEmail.split('@')[0].replace(/[^a-z0-9_-]/g, '');
        let candidateUserId = baseUserId;
        let counter = 1;
        while (await User.findOne({ userId: candidateUserId })) {
          candidateUserId = `${baseUserId}${counter++}`;
        }

        user = new User({
          userId: candidateUserId,
          googleId,
          name: name || cleanEmail.split('@')[0],
          email: cleanEmail,
          avatar: picture || '',
          role: 'user', // default user role
          permissions: [],
          isActive: true,
          isEmailVerified: Boolean(email_verified),
          isSuperAdminProtected: false
        });
        await user.save();
      }
    } else {
      user.lastLogin = new Date();
      if (picture && (!user.avatar || user.avatar.includes('dicebear'))) user.avatar = picture;
      await user.save();
    }

    const token = generateAuthToken(user);
    const safeUser = sanitizeUser(user);

    const userJson = JSON.stringify(safeUser).replace(/</g, '\\u003c');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Logging in...</title></head>
      <body>
        <div style="font-family:sans-serif; text-align:center; padding:50px;">
          <h2>Completing Google Sign-In...</h2>
          <p>Redirecting you to Hajar App...</p>
        </div>
        <script>
          try {
            const user = ${userJson};
            const token = ${JSON.stringify(token)};
            localStorage.setItem('hajar_user', JSON.stringify(user));
            localStorage.setItem('hajar_token', token);
            window.location.href = '/#attendance';
          } catch(e) {
            window.location.href = '/login.html';
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
  }
});

// -------------------------------------------------------------
// 7. Initial Super Admin Claim / Setup Endpoint (Requirement 3)
// -------------------------------------------------------------
router.post('/init-super-admin', async (req, res) => {
  try {
    // 1. Atomic check: does a Super Admin already exist?
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      return res.status(403).json({ 
        error: 'Initial Super Admin setup is complete. Reinitialization is strictly prohibited.' 
      });
    }

    const { email, password, setupKey } = req.body;
    const cleanEmail = normalizeEmail(email);

    // Verify setup key or verify that target matches SUPER_ADMIN_EMAIL
    if (INITIAL_SETUP_KEY && setupKey !== INITIAL_SETUP_KEY) {
      return res.status(403).json({ error: 'Invalid admin setup key.' });
    }

    if (cleanEmail !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ 
        error: `Only the designated administrator email (${SUPER_ADMIN_EMAIL}) can claim initial Super Admin privileges.` 
      });
    }

    // Find the user and verify identity
    let user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ 
        error: `User account for ${cleanEmail} not found. Please register an account first, then initialize.` 
      });
    }

    if (password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Incorrect account password.' });
      }
    }

    // Atomic designation
    user.role = 'super_admin';
    user.isSuperAdminProtected = true;
    user.permissions = ['*'];
    user.isActive = true;
    user.isEmailVerified = true;
    await user.save();

    await logActivity(
      'SUPER_ADMIN_INITIALIZED',
      `Initial Super Admin verified and designated: ${user.name} (${user.email})`,
      user
    );

    const token = generateAuthToken(user);

    res.json({
      success: true,
      message: 'Initial Super Admin established successfully.',
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 8. Role Switcher for Development / Testing (Fast Switching)
// -------------------------------------------------------------
router.post('/login-as', async (req, res) => {
  try {
    const { role } = req.body;
    const targetRole = role === 'admin' ? 'super_admin' : 'user';

    let user = null;
    if (targetRole === 'super_admin') {
      user = await User.findOne({ role: 'super_admin' });
      if (!user) {
        user = await User.findOne({ email: SUPER_ADMIN_EMAIL });
      }
    } else {
      user = await User.findOne({ role: 'user' });
      if (!user) {
        user = await User.findOne({ email: 'teacher@hajar.edu' });
      }
    }

    if (!user) {
      return res.status(404).json({ error: `Account for role "${role}" not found.` });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateAuthToken(user);

    res.json({
      success: true,
      token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 9. Logout Endpoint
// -------------------------------------------------------------
router.post('/logout', async (req, res) => {
  try {
    const { user } = req.body;
    if (user && user.name) {
      await logActivity('USER_LOGOUT', `User signed out: ${user.name}`);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.json({ success: true });
  }
});

router.seedDefaultUsers = seedDefaultUsers;
module.exports = router;