const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../../server/models/User');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
      let user = await User.findOne({ googleId: profile.id });

      if (!user && email) {
        user = await User.findOne({ email: email.toLowerCase() });
      }

      if (!user) {
        user = await User.create({
          googleId: profile.id,
          name: profile.displayName || (email ? email.split('@')[0] : 'User'),
          email: email.toLowerCase(),
          avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : '',
          role: 'teacher'
        });
      } else {
        user.lastLogin = new Date();
        if (!user.googleId) user.googleId = profile.id;
        await user.save();
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

module.exports = passport;