/**
 * Hajar App - API Client Service
 */

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  try {
    const res = await fetch(url, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}: ${res.statusText}`);
    }
    return data;
  } catch (err) {
    console.error(`[API Error] ${options.method || 'GET'} ${endpoint}:`, err);
    throw err;
  }
}

const api = {
  // Classes
  classes: {
    getAll: () => request('/classes'),
    getById: (id) => request(`/classes/${id}`),
    create: (data) => request('/classes', { method: 'POST', body: data }),
    update: (id, data) => request(`/classes/${id}`, { method: 'PUT', body: data }),
    delete: (id, user) => request(`/classes/${id}`, { method: 'DELETE', body: { user } })
  },

  // Subjects
  subjects: {
    getAll: () => request('/subjects'),
    getByClass: (classId) => request(`/subjects/by-class/${classId}`),
    create: (data) => request('/subjects', { method: 'POST', body: data }),
    update: (id, data) => request(`/subjects/${id}`, { method: 'PUT', body: data }),
    delete: (id, user) => request(`/subjects/${id}`, { method: 'DELETE', body: { user } })
  },

  // Students
  students: {
    getAll: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/students${q ? `?${q}` : ''}`);
    },
    getById: (id) => request(`/students/${id}`),
    create: (data) => request('/students', { method: 'POST', body: data }),
    update: (id, data) => request(`/students/${id}`, { method: 'PUT', body: data }),
    delete: (id, user) => request(`/students/${id}`, { method: 'DELETE', body: { user } })
  },

  // Attendance
  attendance: {
    getSession: (date, classId, subjectId) => 
      request(`/attendance/session?date=${date}&classId=${classId}&subjectId=${subjectId}`),
    save: (data) => request('/attendance', { method: 'POST', body: data }),
    getRecent: () => request('/attendance/recent'),
    delete: (id, user) => request(`/attendance/${id}`, { method: 'DELETE', body: { user } })
  },

  // Reports
  reports: {
    get: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/reports?${q}`);
    },
    getExportCsvUrl: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return `${API_BASE}/reports/export-csv?${q}`;
    }
  },

  // Settings & System
  settings: {
    getStats: () => request('/settings/stats'),
    getActivities: (limit = 50) => request(`/settings/activities?limit=${limit}`),
    clearAttendance: (classId, user) => 
      request('/settings/clear-attendance', { method: 'DELETE', body: { classId, user } }),
    resetApp: (user) => 
      request('/settings/reset-app', { method: 'POST', body: { user } }),
    seedSample: (user) => 
      request('/settings/seed-sample', { method: 'POST', body: { user } })
  },

  // Auth & Roles
  auth: {
    getConfig: () => request('/auth/config'),
    login: (identifier, password) => 
      request('/auth/login', { method: 'POST', body: { identifier, password } }),
    register: (userData) => 
      request('/auth/register', { method: 'POST', body: userData }),
    verifyGoogle: (credential, client_id) => 
      request('/auth/google', { method: 'POST', body: { credential, client_id } }),
    loginAs: (role, name, email) => 
      request('/auth/login-as', { method: 'POST', body: { role, name, email } }),
    logout: (user) => 
      request('/auth/logout', { method: 'POST', body: { user } })
  }
};

window.api = api;
