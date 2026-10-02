const Activity = require('../models/Activity');

async function logActivity(action, description, user = {}, details = {}) {
  try {
    const act = new Activity({
      action,
      description,
      user: {
        name: user.name || 'Admin',
        email: user.email || 'admin@hajar.edu',
        role: user.role || 'admin'
      },
      details
    });
    await act.save();
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
}

module.exports = { logActivity };
