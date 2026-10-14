/**
 * Comprehensive Automated Test Suite for Hajar Admin, Role, and Permission Management System
 * Run: node server/test_admin_system.js
 */

const http = require('http');
const assert = require('assert');

// Spin up test server directly importing app
const express = require('express');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 HAJAR ADMIN, ROLE & PERMISSION SYSTEM TEST SUITE');
  console.log('====================================================\n');

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_SETUP_KEY = 'hajar_secure_test_key_2026';
  process.env.SUPER_ADMIN_EMAIL = 'superadmin@hajar.edu';
  process.env.PORT = 3099;

  // Import server components
  const User = require('./models/User');
  const Activity = require('./models/Activity');
  const { generateAuthToken } = require('./utils/authHelper');
  const { VALID_PERMISSIONS } = require('./config/permissions');

  // Require startServer from server.js
  const { startServer } = require('./server');
  const server = await startServer();
  const baseUrl = 'http://127.0.0.1:3099';

  // Helper function for HTTP requests
  async function apiRequest(method, path, body = null, token = null) {
    const url = new URL(path, baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'X-Environment': 'demo' // use demo environment to isolate tests
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    return new Promise((resolve, reject) => {
      const req = http.request(url, {
        method,
        headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            parsed = data;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Small delay helper
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(1000); // Wait for server to bind

  let superAdminToken = null;
  let superAdminUser = null;
  let normalUserToken = null;
  let normalUserId = null;
  let testPassCount = 0;
  let testTotalCount = 0;

  function recordTest(desc, passed, detail = '') {
    testTotalCount++;
    if (passed) {
      testPassCount++;
      console.log(`  ✓ [PASS] ${desc}`);
    } else {
      console.error(`  ✗ [FAIL] ${desc} - ${detail}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Default Role Assignment on Registration
    // -------------------------------------------------------------
    console.log('\n--- Objective 1 & 2: User Registration & Default Role ---');

    const regPayload = {
      name: 'Teacher Alex',
      userId: `alex_${Date.now()}`,
      email: `alex_${Date.now()}@hajar.edu`,
      password: 'StrongPassword123!',
      role: 'super_admin', // Malicious attempt to escalate role
      permissions: ['*']   // Malicious attempt to claim all permissions
    };

    const regRes = await apiRequest('POST', '/api/auth/register', regPayload);
    recordTest(
      'Registration succeeds (HTTP 201)',
      regRes.status === 201,
      `Status: ${regRes.status}`
    );

    recordTest(
      'Client-supplied role is IGNORED; role defaults strictly to "user"',
      regRes.data.user && regRes.data.user.role === 'user',
      `Got role: ${regRes.data.user?.role}`
    );

    recordTest(
      'Client-supplied permissions are IGNORED; permissions default to empty array',
      regRes.data.user && Array.isArray(regRes.data.user.permissions) && regRes.data.user.permissions.length === 0,
      `Got permissions: ${JSON.stringify(regRes.data.user?.permissions)}`
    );

    recordTest(
      'Auth token is issued upon successful registration',
      typeof regRes.data.token === 'string' && regRes.data.token.length > 20,
      'Token missing or invalid'
    );

    normalUserToken = regRes.data.token;
    normalUserId = regRes.data.user._id || regRes.data.user.id;

    // -------------------------------------------------------------
    // TEST 2: Super Admin Bootstrap & Login
    // -------------------------------------------------------------
    console.log('\n--- Objective 3: Super Admin Initialization & Bootstrap ---');

    // Super Admin login with default seeded super admin or loginAs
    const adminLoginRes = await apiRequest('POST', '/api/auth/login', {
      identifier: 'admin',
      password: 'admin'
    });

    if (adminLoginRes.status === 200 && adminLoginRes.data.user) {
      superAdminUser = adminLoginRes.data.user;
      superAdminToken = adminLoginRes.data.token;
      recordTest(
        'Super Admin logs in with credentials and receives token',
        superAdminUser.role === 'super_admin' && Boolean(superAdminToken),
        `Role: ${superAdminUser.role}`
      );
    } else {
      // Fallback: Use loginAs endpoint
      const fallbackRes = await apiRequest('POST', '/api/auth/login-as', {
        role: 'admin',
        name: 'Admin Noorudheen',
        email: 'admin@hajar.edu'
      });
      superAdminUser = fallbackRes.data.user;
      superAdminToken = fallbackRes.data.token;
      recordTest(
        'Super Admin acquired session token',
        Boolean(superAdminToken),
        'Failed to acquire admin token'
      );
    }

    // Test rejection of unauthorized super admin reinitialization
    const reInitRes = await apiRequest('POST', '/api/auth/init-super-admin', {
      setupKey: 'hajar_secure_test_key_2026',
      email: 'another_admin@hajar.edu',
      name: 'Impostor Admin',
      password: 'NewAdminPassword123!'
    });

    recordTest(
      'Re-initialization rejected when Super Admin already exists (400 or 403)',
      (reInitRes.status === 400 || reInitRes.status === 403) && (reInitRes.data?.error?.includes('already exists') || reInitRes.data?.error?.includes('prohibited')),
      `Status: ${reInitRes.status}, Error: ${reInitRes.data?.error}`
    );

    // -------------------------------------------------------------
    // TEST 3: Admin User Management Access Control
    // -------------------------------------------------------------
    console.log('\n--- Objective 4 & 5: Admin Management & Access Control ---');

    // Normal user attempts to access /api/admin/users
    const unauthListRes = await apiRequest('GET', '/api/admin/users', null, normalUserToken);
    recordTest(
      'Normal user is denied access to /api/admin/users (403 Forbidden)',
      unauthListRes.status === 403,
      `Status: ${unauthListRes.status}`
    );

    // Super Admin accesses /api/admin/users
    const authListRes = await apiRequest('GET', '/api/admin/users', null, superAdminToken);
    recordTest(
      'Super Admin can access /api/admin/users (200 OK)',
      authListRes.status === 200 && Array.isArray(authListRes.data.users),
      `Status: ${authListRes.status}`
    );

    // -------------------------------------------------------------
    // TEST 4: Promoting Normal User to Custom Admin
    // -------------------------------------------------------------
    console.log('\n--- Objective 6: Promoting Member to Custom Admin ---');

    // Normal user attempts to promote someone
    const selfPromoteRes = await apiRequest('POST', `/api/admin/users/${normalUserId}/promote`, {}, normalUserToken);
    recordTest(
      'Normal user cannot promote anyone (403 Forbidden)',
      selfPromoteRes.status === 403,
      `Status: ${selfPromoteRes.status}`
    );

    // Super Admin promotes normal user
    const promoteRes = await apiRequest('POST', `/api/admin/users/${normalUserId}/promote`, {}, superAdminToken);
    recordTest(
      'Super Admin promotes user to Custom Admin (200 OK)',
      promoteRes.status === 200 && promoteRes.data.user.role === 'admin',
      `Got status: ${promoteRes.status}, role: ${promoteRes.data.user?.role}`
    );

    recordTest(
      'Newly promoted Custom Admin starts with ZERO permissions by default',
      Array.isArray(promoteRes.data.user.permissions) && promoteRes.data.user.permissions.length === 0,
      `Permissions: ${JSON.stringify(promoteRes.data.user?.permissions)}`
    );

    // -------------------------------------------------------------
    // TEST 5: Granular Feature Permission Enforcement
    // -------------------------------------------------------------
    console.log('\n--- Objective 7 & 8: Granular Permission Enforcement ---');

    // Newly promoted Custom Admin (with 0 permissions) attempts to create a class
    const deniedClassRes = await apiRequest('POST', '/api/classes', {
      name: 'Unauthorized Class',
      section: 'Z'
    }, normalUserToken);

    recordTest(
      'Custom Admin without classes.manage permission is REJECTED (403)',
      deniedClassRes.status === 403,
      `Status: ${deniedClassRes.status}, Error: ${deniedClassRes.data?.error}`
    );

    // Super Admin attempts to assign INVALID permission key
    const invalidPermRes = await apiRequest('PATCH', `/api/admin/users/${normalUserId}/permissions`, {
      permissions: ['classes.manage', 'invalid.permission.key']
    }, superAdminToken);

    recordTest(
      'Invalid permission strings are strictly rejected with 400',
      invalidPermRes.status === 400,
      `Status: ${invalidPermRes.status}`
    );

    // Super Admin grants ONLY classes.manage
    const grantPermRes = await apiRequest('PATCH', `/api/admin/users/${normalUserId}/permissions`, {
      permissions: ['classes.manage']
    }, superAdminToken);

    recordTest(
      'Super Admin assigns specific permission ["classes.manage"] (200 OK)',
      grantPermRes.status === 200 && grantPermRes.data.user.permissions.includes('classes.manage'),
      `Status: ${grantPermRes.status}, Perms: ${JSON.stringify(grantPermRes.data.user?.permissions)}`
    );

    // Now Custom Admin attempts to create class -> Should SUCCEED!
    const allowedClassRes = await apiRequest('POST', '/api/classes', {
      name: 'Biology',
      section: 'A',
      academicYear: '2026'
    }, normalUserToken);

    recordTest(
      'Custom Admin with classes.manage permission successfully creates class (201)',
      allowedClassRes.status === 201,
      `Status: ${allowedClassRes.status}`
    );

    // But Custom Admin does NOT have subjects.manage -> should FAIL!
    const deniedSubjRes = await apiRequest('POST', '/api/subjects', {
      name: 'Advanced Genetics',
      code: 'BIO301'
    }, normalUserToken);

    recordTest(
      'Custom Admin without subjects.manage is REJECTED from subjects (403)',
      deniedSubjRes.status === 403,
      `Status: ${deniedSubjRes.status}, Error: ${deniedSubjRes.data?.error}`
    );

    // Custom Admin attempts to modify their own permissions
    const selfEscalateRes = await apiRequest('PATCH', `/api/admin/users/${normalUserId}/permissions`, {
      permissions: ['*']
    }, normalUserToken);

    recordTest(
      'Custom Admin cannot modify their own permissions (403 Forbidden)',
      selfEscalateRes.status === 403,
      `Status: ${selfEscalateRes.status}`
    );

    // -------------------------------------------------------------
    // TEST 6: Demotion & Immediate Permission Revocation
    // -------------------------------------------------------------
    console.log('\n--- Objective 9: Demotion & Immediate Revocation ---');

    const demoteRes = await apiRequest('POST', `/api/admin/users/${normalUserId}/demote`, {}, superAdminToken);
    recordTest(
      'Super Admin demotes Custom Admin to normal user (200 OK)',
      demoteRes.status === 200 && demoteRes.data.user.role === 'user',
      `Got status: ${demoteRes.status}, role: ${demoteRes.data.user?.role}`
    );

    recordTest(
      'Demotion immediately wipes all assigned permissions',
      Array.isArray(demoteRes.data.user.permissions) && demoteRes.data.user.permissions.length === 0,
      `Permissions: ${JSON.stringify(demoteRes.data.user?.permissions)}`
    );

    // Demoted user immediately attempts to create class -> Should FAIL (403)
    const postDemoteRes = await apiRequest('POST', '/api/classes', {
      name: 'Chemistry',
      section: 'B'
    }, normalUserToken);

    recordTest(
      'Demoted user immediately blocked from class creation (403)',
      postDemoteRes.status === 403,
      `Status: ${postDemoteRes.status}`
    );

    // -------------------------------------------------------------
    // TEST 7: Super Admin Protection Guards
    // -------------------------------------------------------------
    console.log('\n--- Objective 10: Super Admin Account Protection ---');

    const superAdminId = superAdminUser._id || superAdminUser.id;

    // Attempt to demote Super Admin
    const demoteSuperRes = await apiRequest('POST', `/api/admin/users/${superAdminId}/demote`, {}, superAdminToken);
    recordTest(
      'Demoting primary Super Admin is strictly PREVENTED (400 or 403)',
      [400, 403].includes(demoteSuperRes.status) && demoteSuperRes.data?.error?.includes('Super Admin'),
      `Status: ${demoteSuperRes.status}, Error: ${demoteSuperRes.data?.error}`
    );

    // Attempt to suspend Super Admin
    const suspendSuperRes = await apiRequest('PATCH', `/api/admin/users/${superAdminId}/status`, {
      isActive: false
    }, superAdminToken);
    recordTest(
      'Suspending primary Super Admin is strictly PREVENTED (400 or 403)',
      [400, 403].includes(suspendSuperRes.status),
      `Status: ${suspendSuperRes.status}`
    );

    // Attempt to delete Super Admin
    const deleteSuperRes = await apiRequest('DELETE', `/api/admin/users/${superAdminId}`, {}, superAdminToken);
    recordTest(
      'Deleting primary Super Admin is strictly PREVENTED (400 or 403)',
      [400, 403].includes(deleteSuperRes.status),
      `Status: ${deleteSuperRes.status}`
    );

    // -------------------------------------------------------------
    // TEST 8: Immutable Audit Logs
    // -------------------------------------------------------------
    console.log('\n--- Objective 11: Security & Role Audit Trail ---');

    const auditRes = await apiRequest('GET', '/api/admin/audit-logs', null, superAdminToken);
    recordTest(
      'Super Admin can retrieve audit logs (200 OK)',
      auditRes.status === 200 && Array.isArray(auditRes.data.logs),
      `Status: ${auditRes.status}`
    );

    const logTypes = (auditRes.data.logs || []).map(l => l.actionType || l.action);
    recordTest(
      'Audit trail recorded USER_PROMOTED action',
      logTypes.some(t => t && t.includes('PROMOT')),
      `Actions recorded: ${JSON.stringify(logTypes.slice(0, 5))}`
    );

    recordTest(
      'Audit trail recorded PERMISSIONS_UPDATED action',
      logTypes.some(t => t && t.includes('PERMISSIO')),
      `Actions recorded: ${JSON.stringify(logTypes.slice(0, 5))}`
    );

    recordTest(
      'Audit trail recorded USER_DEMOTED action',
      logTypes.some(t => t && t.includes('DEMOT')),
      `Actions recorded: ${JSON.stringify(logTypes.slice(0, 5))}`
    );

  } catch (err) {
    console.error('\n❌ Unexpected error during test run:', err);
  } finally {
    if (server && server.close) {
      server.close();
    }
    console.log('\n====================================================');
    console.log(`📊 TEST RESULTS: ${testPassCount} / ${testTotalCount} PASSED`);
    console.log('====================================================\n');
    process.exit(testPassCount === testTotalCount ? 0 : 1);
  }
}

runTests();
