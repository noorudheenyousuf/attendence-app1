const mongoose = require('mongoose');

/**
 * Sanitizes MongoDB connection string:
 * - Trims whitespaces
 * - Encodes special characters in credentials (such as '@' in passwords)
 * - Ensures a target database name exists
 */
function sanitizeMongoUri(uri, defaultDb = 'hajar_app') {
  if (!uri || typeof uri !== 'string') return uri;
  uri = uri.trim();
  const protocolMatch = uri.match(/^(mongodb(?:\+srv)?:\/\/)(.*)$/);
  if (!protocolMatch) return uri;
  const protocol = protocolMatch[1];
  const rest = protocolMatch[2];
  const lastAtIndex = rest.lastIndexOf('@');
  if (lastAtIndex === -1) return uri;
  const userInfo = rest.substring(0, lastAtIndex);
  let hostAndQuery = rest.substring(lastAtIndex + 1);
  const colonIndex = userInfo.indexOf(':');
  if (colonIndex === -1) return uri;
  const username = userInfo.substring(0, colonIndex);
  const password = userInfo.substring(colonIndex + 1);

  let safeUser = username;
  let safePass = password;
  try {
    safeUser = encodeURIComponent(decodeURIComponent(username));
  } catch (_) {
    safeUser = encodeURIComponent(username);
  }
  try {
    safePass = encodeURIComponent(decodeURIComponent(password));
  } catch (_) {
    safePass = encodeURIComponent(password);
  }

  const queryIndex = hostAndQuery.indexOf('?');
  const slashIndex = hostAndQuery.indexOf('/');
  if (slashIndex === -1) {
    if (queryIndex !== -1) {
      hostAndQuery = hostAndQuery.slice(0, queryIndex) + '/' + defaultDb + hostAndQuery.slice(queryIndex);
    } else {
      hostAndQuery = hostAndQuery + '/' + defaultDb;
    }
  } else if (slashIndex === hostAndQuery.length - 1 || (queryIndex !== -1 && slashIndex === queryIndex - 1)) {
    hostAndQuery = hostAndQuery.slice(0, slashIndex + 1) + defaultDb + (queryIndex !== -1 ? hostAndQuery.slice(queryIndex) : '');
  }

  return `${protocol}${safeUser}:${safePass}@${hostAndQuery}`;
}

const connectDB = async () => {
  const localUri = 'mongodb://127.0.0.1:27017/hajar_app';
  const rawUri = (process.env.MONGODB_URI || '').trim() || localUri;
  const primaryUri = sanitizeMongoUri(rawUri);
  const hasPlaceholder = rawUri.includes('<db_password>') || rawUri.includes('<password>') || primaryUri.includes('%3Cdb_password%3E');

  if (hasPlaceholder) {
    console.warn('\n⚠️  [MongoDB Notice]: MONGODB_URI contains unconfigured placeholder <db_password>.');
    console.warn('   To use MongoDB Atlas, replace <db_password> with your MongoDB database user password.');
    console.log('[MongoDB] Checking for local database fallback (mongodb://127.0.0.1:27017/hajar_app)...');
    try {
      const localConn = await mongoose.connect(localUri, { serverSelectionTimeoutMS: 2000 });
      console.log(`[MongoDB] Connected successfully to local database: ${localConn.connection.host}/${localConn.connection.name}`);
      return true;
    } catch (localErr) {
      console.log('[MongoDB] Local database not found. Activating Zero-Downtime In-Memory Mode.');
      mongoose.set('bufferCommands', false);
      return false;
    }
  }

  // 1. Attempt connection with primary URI
  try {
    const isAtlas = primaryUri.includes('mongodb+srv') || primaryUri.includes('mongodb.net');
    console.log(`[MongoDB] Connecting to ${isAtlas ? 'MongoDB Atlas' : 'local database'}...`);

    const conn = await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 4000,
    });
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
    return true;
  } catch (error) {
    console.error(`[MongoDB] Connection error: ${error.message}`);

    // Disable buffering immediately so requests never freeze for 10 seconds
    mongoose.set('bufferCommands', false);

    // 2. If primary was remote/Atlas and failed, attempt fallback to local MongoDB service
    if (primaryUri !== localUri) {
      console.log('[MongoDB] Attempting fallback to local MongoDB (mongodb://127.0.0.1:27017/hajar_app)...');
      try {
        const localConn = await mongoose.connect(localUri, {
          serverSelectionTimeoutMS: 2000,
        });
        console.log(`[MongoDB] Connected successfully via local fallback: ${localConn.connection.host}/${localConn.connection.name}`);
        return true;
      } catch (localErr) {
        console.log('[MongoDB] Local fallback unavailable.');
      }
    }

    if (error.message.includes('authentication failed') || error.message.includes('bad auth')) {
      console.warn('\n----------------------------------------------------------------------');
      console.warn('⚠️  [MongoDB Atlas Notice]: Authentication failed (bad auth).');
      console.warn('Your database user password in MONGODB_URI is incorrect or expired.');
      console.warn('To fix:');
      console.warn('  1. Go to https://cloud.mongodb.com -> Select your Project.');
      console.warn('  2. Click "Database Access" under Security in the left sidebar.');
      console.warn('  3. Find the user (e.g. noorudheenmuzammil09_db_user) -> Click "Edit" -> "Edit Password".');
      console.warn('  4. Set a new password and click "Update User".');
      console.warn('  5. In your Render Dashboard (or .env), update MONGODB_URI with the new password.');
      console.warn('----------------------------------------------------------------------\n');
    } else if (error.message.includes('IP that isn\'t whitelisted') || error.message.includes('SSL alert number 80') || error.message.includes('tlsv1 alert')) {
      console.warn('\n----------------------------------------------------------------------');
      console.warn('⚠️  [MongoDB Atlas Notice]: Access from your current IP is blocked.');
      console.warn('To allow Render/public connections:');
      console.warn('  1. Go to https://cloud.mongodb.com and log in.');
      console.warn('  2. Select your Project -> Click "Network Access" under Security.');
      console.warn('  3. Click "Add IP Address" -> Select "Allow Access From Anywhere" (0.0.0.0/0).');
      console.warn('  4. Click "Confirm". Atlas applies changes in 1-2 minutes.');
      console.warn('----------------------------------------------------------------------\n');
    }

    console.log('[MongoDB] Activated Zero-Downtime In-Memory Mode. School app will run smoothly with demo data.');
    return false;
  }
};

module.exports = connectDB;
