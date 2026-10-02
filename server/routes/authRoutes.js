const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { logActivity } = require('../utils/logger');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const client = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Get Google client config
router.get('/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    adminEmail: process.env.ADMIN_EMAIL || 'admin@hajar.edu',
    isGoogleAuthEnabled: Boolean(process.env.GOOGLE_CLIENT_ID)
  });
});

// Google Sign-In verification endpoint
router.post('/google', async (req, res) => {
  try {
    const { credential, client_id } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential token' });
    }

    let payload;
    // If client ID is configured and matches, verify with google-auth-library
    if (client && (client_id || GOOGLE_CLIENT_ID)) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: client_id || GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      } catch (verifyErr) {
        console.warn('Google verifyIdToken failed, parsing token payload directly:', verifyErr.message);
        // Fallback to base64 decode if client mismatch in dev
        const parts = credential.split('.');
        if (parts.length === 3) {
          payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        }
      }
    } else {
      // Decode JWT payload
      const parts = credential.split('.');
      if (parts.length === 3) {
        payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      }
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google credential token' });
    }

    const { email, name, picture, sub: googleId } = payload;
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hajar.edu').toLowerCase();

    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase() });
    const isFirstUser = (await User.countDocuments()) === 0;

    let role = 'teacher';
    if (email.toLowerCase() === adminEmail || isFirstUser) {
      role = 'admin';
    }

    if (!user) {
      user = new User({
        googleId,
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        avatar: picture || '',
        role
      });
      await user.save();
      await logActivity('USER_REGISTERED', `New user registered via Google: ${user.name} (${user.role})`, user);
    } else {
      user.lastLogin = new Date();
      if (picture && !user.avatar) user.avatar = picture;
      // Preserve admin role if designated
      if (email.toLowerCase() === adminEmail) {
        user.role = 'admin';
      }
      await user.save();
      await logActivity('USER_LOGIN', `User logged in via Google: ${user.name}`, user);
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Authentication failed', details: err.message });
  }
});

// Mock/Direct login for development and seamless teacher/admin multi-user testing
router.post('/login-as', async (req, res) => {
  try {
    const { role, name, email } = req.body;
    const targetRole = role === 'admin' ? 'admin' : 'teacher';
    const targetEmail = (email || (targetRole === 'admin' ? (process.env.ADMIN_EMAIL || 'admin@hajar.edu') : 'teacher@hajar.edu')).toLowerCase();
    const targetName = name || (targetRole === 'admin' ? 'Hajar Admin' : 'School Teacher');

    let user = await User.findOne({ email: targetEmail });
    if (!user) {
      user = new User({
        name: targetName,
        email: targetEmail,
        role: targetRole,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${targetEmail}`
      });
      await user.save();
    } else {
      user.role = targetRole;
      user.lastLogin = new Date();
      await user.save();
    }

    await logActivity('USER_LOGIN', `User logged in as ${user.role}: ${user.name}`, user);

    res.json({
      success: true,
      user: {
        id: user._id,
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

module.exports = router;
