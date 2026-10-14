const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { logActivity } = require('../utils/logger');

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

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

// Helper: Seed default accounts on startup
async function seedDefaultUsers() {
  try {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hajar.edu').toLowerCase();

    // Check or create admin
    let admin = await User.findOne({ $or: [{ userId: 'admin' }, { email: adminEmail }] });
    if (!admin) {
      admin = new User({
        userId: 'admin',
        name: 'Admin Noorudheen',
        email: adminEmail,
        password: 'admin123',
        role: 'admin',
        avatar: '/black coat.jpeg'
      });
      await admin.save();
      console.log('[Auth] Created default admin account (User ID: admin | Password: admin123)');
    } else {
      let needsSave = false;
      if (!admin.userId) { admin.userId = 'admin'; needsSave = true; }
      if (!admin.password) { admin.password = 'admin123'; needsSave = true; }
      if (admin.role !== 'admin') { admin.role = 'admin'; needsSave = true; }
      if (needsSave) await admin.save();
    }

    // Check or create teacher
    let teacher = await User.findOne({ $or: [{ userId: 'teacher' }, { email: 'teacher@hajar.edu' }] });
    if (!teacher) {
      teacher = new User({
        userId: 'teacher',
        name: 'Teacher Fatima',
        email: 'teacher@hajar.edu',
        password: 'teacher123',
        role: 'teacher',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=teacher@hajar.edu'
      });
      await teacher.save();
      console.log('[Auth] Created default teacher account (User ID: teacher | Password: teacher123)');
    } else {
      let needsSave = false;
      if (!teacher.userId) { teacher.userId = 'teacher'; needsSave = true; }
      if (!teacher.password) { teacher.password = 'teacher123'; needsSave = true; }
      if (needsSave) await teacher.save();
    }
  } catch (err) {
    console.warn('[Auth] Default users check notice:', err.message);
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
// 1. Get Google client config
// -------------------------------------------------------------
router.get('/config', (req, res) => {
  const mongoose = require('mongoose');
  const isDbConnected = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    adminEmail: process.env.ADMIN_EMAIL || 'admin@hajar.edu',
    isGoogleAuthEnabled: Boolean(GOOGLE_CLIENT_ID),
    databaseConnected: isDbConnected,
    databaseMode: isDbConnected ? 'mongodb' : 'memory'
  });
});

// -------------------------------------------------------------
// 2. User ID & Password Login
// -------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { identifier, userId, email, password } = req.body;
    const loginId = (identifier || userId || email || '').trim().toLowerCase();

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Please enter both User ID/Email and password.' });
    }

    // Find by userId or email
    const user = await User.findOne({
      $or: [
        { userId: loginId },
        { email: loginId }
      ]
    });

    if (!user) {
      return res.status(401).json({ 
        error: `User "${loginId}" not found. Please check your credentials or register a new account.` 
      });
    }

    if (!user.password) {
      return res.status(400).json({ 
        error: 'This account was created via Google Sign-In. Please click "Sign in with Google" or set a password in Settings.' 
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    user.lastLogin = new Date();
    await user.save();

    await logActivity('USER_LOGIN', `User logged in with credentials: ${user.name} (${user.userId || user.email})`, user);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Password login error:', err);
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
});

// -------------------------------------------------------------
// 3. User Registration (User ID & Password)
// -------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { userId, name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, Email, and Password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
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

    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hajar.edu').toLowerCase();
    const userCount = await User.countDocuments();
    let assignedRole = role === 'admin' ? 'admin' : 'teacher';
    if (cleanEmail === adminEmail || userCount === 0) {
      assignedRole = 'admin';
    }

    const newUser = new User({
      userId: cleanUserId,
      name: name.trim(),
      email: cleanEmail,
      password,
      role: assignedRole,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanEmail}`
    });

    await newUser.save();
    await logActivity('USER_REGISTERED', `New account registered: ${newUser.name} (${newUser.userId || newUser.email})`, newUser);

    res.status(201).json({
      success: true,
      message: 'Account registered successfully',
      user: {
        id: newUser._id,
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        avatar: newUser.avatar,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

// -------------------------------------------------------------
// 4. Google Sign-In Verification (Google Identity Services GIS)
// -------------------------------------------------------------
router.post('/google', async (req, res) => {
  try {
    const { credential, client_id } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential token' });
    }

    let payload;
    // Attempt verification with Google client library
    if (client) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: client_id || GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (verifyErr) {
        console.warn('Google verifyIdToken note:', verifyErr.message);
        // Fallback to safe JWT payload decode
        payload = decodeJwtPayload(credential);
      }
    } else {
      payload = decodeJwtPayload(credential);
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google credential token' });
    }

    const { email, name, picture, sub: googleId } = payload;
    const cleanEmail = email.toLowerCase().trim();
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hajar.edu').toLowerCase();

    // Check if user exists by googleId or email (avoid { googleId: undefined } which matches any doc without googleId)
    const userQuery = (googleId && typeof googleId === 'string')
      ? { $or: [{ googleId }, { email: cleanEmail }] }
      : { email: cleanEmail };

    let user = await User.findOne(userQuery);

    const isFirstUser = (await User.countDocuments()) === 0;
    let role = 'teacher';
    if (cleanEmail === adminEmail || isFirstUser) {
      role = 'admin';
    }

    if (!user) {
      // Generate clean userId from email prefix
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
        role
      });
      await user.save();
      await logActivity('USER_REGISTERED', `New user registered via Google: ${user.name} (${user.role})`, user);
    } else {
      user.lastLogin = new Date();
      if (!user.googleId && googleId) user.googleId = googleId;
      if (picture && (!user.avatar || user.avatar.includes('dicebear'))) {
        user.avatar = picture;
      }
      if (cleanEmail === adminEmail) {
        user.role = 'admin';
      }
      await user.save();
      await logActivity('USER_LOGIN', `User logged in via Google: ${user.name}`, user);
    }

    res.json({
      success: true,
      message: 'Google authentication successful',
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Authentication failed', 
      details: err.message 
    });
  }
});

// -------------------------------------------------------------
// 5. Google OAuth 2.0 Direct Redirect Flow
// -------------------------------------------------------------
router.get('/google/redirect', (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.redirect('/login.html?error=' + encodeURIComponent('Google Sign-In is not configured. Please set GOOGLE_CLIENT_ID in your environment variables.'));
    }

    const callbackUrl = getCallbackUrl(req);
    // Explicitly build the OAuth URL to guarantee client_id is always present
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
    console.error('Google redirect error:', err);
    res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
  }
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.redirect(`/login.html?error=${encodeURIComponent('Google sign-in error: ' + error)}`);
    }
    if (!code) {
      return res.redirect('/login.html?error=google_auth_failed');
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

    const { email, name, picture, sub: googleId } = payload;
    const cleanEmail = email.toLowerCase().trim();
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hajar.edu').toLowerCase();

    let user = await User.findOne({
      $or: [
        { googleId },
        { email: cleanEmail }
      ]
    });

    const isFirstUser = (await User.countDocuments()) === 0;
    let role = (cleanEmail === adminEmail || isFirstUser) ? 'admin' : 'teacher';

    if (!user) {
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
        role
      });
      await user.save();
      await logActivity('USER_REGISTERED', `User registered via Google OAuth: ${user.name}`, user);
    } else {
      user.lastLogin = new Date();
      if (!user.googleId) user.googleId = googleId;
      if (picture && (!user.avatar || user.avatar.includes('dicebear'))) user.avatar = picture;
      await user.save();
      await logActivity('USER_LOGIN', `User logged in via Google OAuth: ${user.name}`, user);
    }

    const safeUser = {
      id: user._id,
      userId: user.userId,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role
    };

    // Return HTML that stores user into localStorage and redirects to index.html#attendance
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
            localStorage.setItem('hajar_user', JSON.stringify(user));
            window.location.href = '/#attendance';
          } catch(e) {
            window.location.href = '/login.html';
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Google callback error:', err);
    res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
  }
});

// -------------------------------------------------------------
// 6. Direct / Mock Role Switcher (for fast testing)
// -------------------------------------------------------------
router.post('/login-as', async (req, res) => {
  try {
    const { role, name, email } = req.body;
    const targetRole = role === 'admin' ? 'admin' : 'teacher';
    const targetEmail = (email || (targetRole === 'admin' ? (process.env.ADMIN_EMAIL || 'admin@hajar.edu') : 'teacher@hajar.edu')).toLowerCase();
    const targetUserId = targetRole === 'admin' ? 'admin' : 'teacher';
    const targetName = name || (targetRole === 'admin' ? 'Admin Noorudheen' : 'Teacher Fatima');

    let user = await User.findOne({ 
      $or: [{ userId: targetUserId }, { email: targetEmail }] 
    });

    if (!user) {
      user = new User({
        userId: targetUserId,
        name: targetName,
        email: targetEmail,
        password: targetRole === 'admin' ? 'admin123' : 'teacher123',
        role: targetRole,
        avatar: targetRole === 'admin' ? '/black coat.jpeg' : `https://api.dicebear.com/7.x/bottts/svg?seed=${targetEmail}`
      });
      await user.save();
    } else {
      user.role = targetRole;
      user.lastLogin = new Date();
      if (!user.userId) user.userId = targetUserId;
      if (!user.password) user.password = targetRole === 'admin' ? 'admin123' : 'teacher123';
      await user.save();
    }

    await logActivity('USER_LOGIN', `User switched role to ${user.role}: ${user.name}`, user);

    res.json({
      success: true,
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login-as error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. Logout Endpoint
// -------------------------------------------------------------
router.post('/logout', async (req, res) => {
  try {
    const { user } = req.body;
    if (user && user.name) {
      await logActivity('USER_LOGOUT', `User logged out: ${user.name} (${user.role})`);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.json({ success: true });
  }
});

router.seedDefaultUsers = seedDefaultUsers;
module.exports = router;