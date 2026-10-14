/**
 * Hajar App - School Management & Student Attendance PWA
 * Orchestrator & State Management
 */

const state = {
  activeTab: 'attendance',
  theme: localStorage.getItem('hajar_theme') || 'dark',
  currentUser: JSON.parse(localStorage.getItem('hajar_user')) || null,
  classes: [],
  subjects: [],
  students: [],
  currentSession: null,
  activeFilters: {
    classId: '',
    subjectId: 'all',
    year: 'all',
    month: 'all'
  },
  deferredPrompt: null
};

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupEventListeners();
  setupPWA();
  await loadUserData();
  await loadCoreData();

  // Route according to URL hash
  const hash = window.location.hash.replace('#', '') || 'attendance';
  switchTab(hash);

  // If user is not authenticated, prompt sign-in modal
  if (!state.currentUser) {
    openAuthModal('signin');
  }
});

// ==========================================
// Theme Management (Light / Dark Modes)
// ==========================================
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('hajar_theme', state.theme);
  updateThemeIcon();
  showToast(`Switched to ${state.theme} mode`, 'info');
}

function updateThemeIcon() {
  const icon = document.getElementById('theme-toggle-icon');
  if (icon) {
    icon.textContent = state.theme === 'dark' ? '☀️' : '🌙';
  }
}

// ==========================================
// Tab & Navigation Switching
// ==========================================
function switchTab(tabName) {
  const validTabs = ['attendance', 'reports', 'settings', 'students', 'classes', 'subjects'];
  if (!validTabs.includes(tabName)) tabName = 'attendance';

  state.activeTab = tabName;
  window.location.hash = tabName;

  // Update views visibility
  document.querySelectorAll('.app-view').forEach(view => {
    view.classList.remove('active');
  });
  const activeView = document.getElementById(`view-${tabName}`);
  if (activeView) activeView.classList.add('active');

  // Update Top Nav button active state
  document.querySelectorAll('.top-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update Bottom Nav button active state
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Load view-specific data
  if (tabName === 'attendance') {
    initAttendanceView();
  } else if (tabName === 'reports') {
    initReportsView();
  } else if (tabName === 'students') {
    renderStudentsList();
  } else if (tabName === 'classes') {
    renderClassesList();
  } else if (tabName === 'subjects') {
    renderSubjectsList();
  } else if (tabName === 'settings') {
    renderSettingsView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// Event Listeners Setup
// ==========================================
function setupEventListeners() {
  // Theme toggle button
  document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

  // Top Nav clicks
  document.querySelectorAll('.top-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Bottom Nav clicks
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Bottom Quick Add Button
  const quickAddBtn = document.getElementById('btn-quick-add');
  if (quickAddBtn) {
    quickAddBtn.addEventListener('click', () => {
      if (state.activeTab === 'classes') {
        openModal('modal-add-class');
      } else if (state.activeTab === 'subjects') {
        openModal('modal-add-subject');
      } else {
        openModal('modal-add-student');
      }
    });
  }

  // User badge in header
  const userBadge = document.getElementById('user-profile-badge');
  if (userBadge) {
    userBadge.addEventListener('click', () => {
      if (!state.currentUser) {
        openAuthModal('signin');
      } else {
        switchTab('settings');
      }
    });
  }

  // Logout button in header
  const btnHeaderLogout = document.getElementById('btn-header-logout');
  if (btnHeaderLogout) {
    btnHeaderLogout.addEventListener('click', (e) => {
      e.stopPropagation();
      handleLogout();
    });
  }

  // Attendance Form Controls
  const attDate = document.getElementById('att-date');
  const attClass = document.getElementById('att-class-select');
  const attSubject = document.getElementById('att-subject-select');

  if (attDate) attDate.addEventListener('change', loadAttendanceSession);
  if (attClass) {
    attClass.addEventListener('change', async () => {
      await updateSubjectDropdownForClass(attClass.value, 'att-subject-select');
      loadAttendanceSession();
    });
  }
  if (attSubject) attSubject.addEventListener('change', loadAttendanceSession);

  // Mark all present / absent buttons
  const btnAllPresent = document.getElementById('btn-mark-all-present');
  const btnAllAbsent = document.getElementById('btn-mark-all-absent');
  if (btnAllPresent) btnAllPresent.addEventListener('click', () => setAllStudentStatus('present'));
  if (btnAllAbsent) btnAllAbsent.addEventListener('click', () => setAllStudentStatus('absent'));

  // Save Attendance Button
  const btnSaveAtt = document.getElementById('btn-save-attendance');
  if (btnSaveAtt) btnSaveAtt.addEventListener('click', saveAttendanceSession);

  // Reports Filter Controls
  const repClass = document.getElementById('rep-class-select');
  const repSubject = document.getElementById('rep-subject-select');
  const repYear = document.getElementById('rep-year-select');
  const repMonth = document.getElementById('rep-month-select');

  if (repClass) {
    repClass.addEventListener('change', async () => {
      await updateSubjectDropdownForClass(repClass.value, 'rep-subject-select', true);
      generateReport();
    });
  }
  if (repSubject) repSubject.addEventListener('change', generateReport);
  if (repYear) repYear.addEventListener('change', generateReport);
  if (repMonth) repMonth.addEventListener('change', generateReport);

  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const classId = repClass.value;
      if (!classId) return showToast('Please select a class first', 'error');
      const params = {
        classId,
        subjectId: repSubject.value,
        year: repYear.value,
        month: repMonth.value
      };
      window.open(api.reports.getExportCsvUrl(params), '_blank');
    });
  }

  const btnPrintReport = document.getElementById('btn-print-report');
  if (btnPrintReport) {
    btnPrintReport.addEventListener('click', () => window.print());
  }

  // Students Search & Filter
  const studentSearch = document.getElementById('student-search-input');
  const studentClassFilter = document.getElementById('student-class-filter');
  if (studentSearch) studentSearch.addEventListener('input', debounce(renderStudentsList, 300));
  if (studentClassFilter) studentClassFilter.addEventListener('change', renderStudentsList);

  // Modals backdrop clicks and close buttons
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) closeModal(modal.id);
    });
  });

  // Modal Submit Handlers
  setupFormSubmissions();

  // Hash change
  window.addEventListener('hashchange', () => {
    const newHash = window.location.hash.replace('#', '') || 'attendance';
    if (newHash !== state.activeTab) switchTab(newHash);
  });
}

let cachedGoogleClientId = '';

window.onGoogleLibraryLoad = function() {
  if (cachedGoogleClientId) {
    initGoogleSignIn(cachedGoogleClientId);
  }
};

async function loadUserData() {
  updateUserUI();
  try {
    const config = await api.auth.getConfig();
    if (config.googleClientId) {
      cachedGoogleClientId = config.googleClientId;
      initGoogleSignIn(config.googleClientId);
    }
  } catch (err) {
    console.warn('Config fetch notice:', err.message);
  }
}

async function loadCoreData() {
  try {
    const [classes, subjects] = await Promise.all([
      api.classes.getAll(),
      api.subjects.getAll()
    ]);
    state.classes = classes;
    state.subjects = subjects;
    populateClassDropdowns();
  } catch (err) {
    console.error('Error loading core data:', err);
    showToast('Failed to load classes and subjects', 'error');
  }
}

function updateUserUI() {
  const nameEl = document.getElementById('header-user-name');
  const roleEl = document.getElementById('header-user-role');
  const avatarEl = document.getElementById('header-user-avatar');
  const logoutBtn = document.getElementById('btn-header-logout');

  // Settings page elements
  const setAvatar = document.getElementById('settings-user-avatar');
  const setName = document.getElementById('settings-user-name');
  const setRole = document.getElementById('settings-user-role');
  const setUserId = document.getElementById('settings-user-id');
  const setEmail = document.getElementById('settings-user-email');

  if (state.currentUser) {
    const user = state.currentUser;
    const displayName = user.name || 'User';
    const displayRole = (user.role || 'teacher').toUpperCase();
    const avatarSrc = user.avatar || (user.role === 'admin' ? '/black coat.jpeg' : `https://api.dicebear.com/7.x/bottts/svg?seed=${user.email || 'user'}`);

    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) {
      roleEl.textContent = displayRole;
      roleEl.className = `role-pill ${user.role || 'teacher'}`;
    }
    if (avatarEl) avatarEl.src = avatarSrc;
    if (logoutBtn) logoutBtn.style.display = 'flex';

    if (setAvatar) setAvatar.src = avatarSrc;
    if (setName) setName.textContent = displayName;
    if (setRole) {
      setRole.textContent = displayRole;
      setRole.className = `role-pill ${user.role || 'teacher'}`;
    }
    if (setUserId) setUserId.textContent = user.userId || user.email?.split('@')[0] || '-';
    if (setEmail) setEmail.textContent = user.email || '-';
  } else {
    if (nameEl) nameEl.textContent = 'Sign In';
    if (roleEl) {
      roleEl.textContent = 'GUEST';
      roleEl.className = 'role-pill teacher';
    }
    if (avatarEl) avatarEl.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=guest';
    if (logoutBtn) logoutBtn.style.display = 'none';

    if (setName) setName.textContent = 'Not Logged In';
    if (setRole) {
      setRole.textContent = 'GUEST';
      setRole.className = 'role-pill teacher';
    }
    if (setUserId) setUserId.textContent = 'None';
    if (setEmail) setEmail.textContent = 'Please sign in with User ID/Password or Google';
  }
}

function populateClassDropdowns() {
  const options = state.classes.map(c => `<option value="${c._id}">${c.name} - ${c.section}</option>`).join('');

  // Attendance Class dropdown
  const attClass = document.getElementById('att-class-select');
  if (attClass) {
    attClass.innerHTML = options || '<option value="">No classes found</option>';
  }

  // Reports Class dropdown
  const repClass = document.getElementById('rep-class-select');
  if (repClass) {
    repClass.innerHTML = options || '<option value="">No classes found</option>';
  }

  // Students filter dropdown
  const stFilter = document.getElementById('student-class-filter');
  if (stFilter) {
    stFilter.innerHTML = '<option value="all">All Classes</option>' + options;
  }

  // Modal Student Class dropdown
  const modalStClass = document.getElementById('modal-student-class');
  if (modalStClass) {
    modalStClass.innerHTML = '<option value="">Select Class...</option>' + options;
  }

  // Modal Clear Attendance Class dropdown
  const clearClass = document.getElementById('clear-attendance-class');
  if (clearClass) {
    clearClass.innerHTML = '<option value="all">All Classes (Entire School)</option>' + options;
  }
}

async function updateSubjectDropdownForClass(classId, dropdownId, includeAllOption = false) {
  const select = document.getElementById(dropdownId);
  if (!select) return;

  if (!classId) {
    select.innerHTML = '<option value="">Select Class First</option>';
    return;
  }

  try {
    const subjects = await api.subjects.getByClass(classId);
    let html = '';
    if (includeAllOption) {
      html += '<option value="all">All Subjects (Aggregate)</option>';
    }
    html += subjects.map(s => `<option value="${s._id}">${s.name} ${s.code ? `(${s.code})` : ''}</option>`).join('');
    select.innerHTML = html || '<option value="">No subjects found for this class</option>';
  } catch (err) {
    console.error('Error fetching subjects for class:', err);
  }
}

// ==========================================
// Attendance Management (Take & Update)
// ==========================================
async function initAttendanceView() {
  const dateInput = document.getElementById('att-date');
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  const attClass = document.getElementById('att-class-select');
  if (attClass && attClass.value) {
    await updateSubjectDropdownForClass(attClass.value, 'att-subject-select');
    loadAttendanceSession();
  } else if (state.classes.length > 0) {
    attClass.value = state.classes[0]._id;
    await updateSubjectDropdownForClass(state.classes[0]._id, 'att-subject-select');
    loadAttendanceSession();
  }
}

async function loadAttendanceSession() {
  const date = document.getElementById('att-date')?.value;
  const classId = document.getElementById('att-class-select')?.value;
  const subjectId = document.getElementById('att-subject-select')?.value;

  const container = document.getElementById('attendance-students-container');
  const statusBanner = document.getElementById('session-status-banner');
  const saveBtn = document.getElementById('btn-save-attendance');

  if (!date || !classId || !subjectId) {
    if (container) {
      container.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>Please select Date, Class, and Subject to start.</p></div>';
    }
    return;
  }

  if (container) {
    container.innerHTML = '<div class="empty-state"><p>Loading attendance sheet...</p></div>';
  }

  try {
    const data = await api.attendance.getSession(date, classId, subjectId);
    state.currentSession = data;

    // Render Status Banner: Updating vs New
    if (statusBanner) {
      if (data.isExisting) {
        statusBanner.className = 'session-status-banner existing';
        statusBanner.innerHTML = `
          <div>
            <strong>🔄 Updating Attendance:</strong> Session was already recorded by <b>${data.markedByName || 'Teacher'}</b>. Any edits will update the record.
          </div>
        `;
        if (saveBtn) saveBtn.innerHTML = '<span>🔄</span> Update Attendance';
      } else {
        statusBanner.className = 'session-status-banner new';
        statusBanner.innerHTML = `
          <div>
            <strong>✨ New Session:</strong> Attendance not yet recorded for this class/subject on this date.
          </div>
        `;
        if (saveBtn) saveBtn.innerHTML = '<span>💾</span> Save Attendance';
      }
    }

    renderAttendanceStudentsList(data.students);
    updateAttendanceTally();
  } catch (err) {
    console.error('Error loading session:', err);
    if (container) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">Error: ${err.message}</p></div>`;
    }
  }
}

function renderAttendanceStudentsList(students) {
  const container = document.getElementById('attendance-students-container');
  if (!container) return;

  if (!students || students.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">👨‍🎓</div>
        <p>No active students found in this class.</p>
        <button class="btn btn-primary btn-sm" onclick="switchTab('students')" style="margin-top:0.75rem;">
          + Add Students to Class
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = students.map((st, index) => {
    const status = st.status || 'present';
    return `
      <div class="student-att-card" data-student-id="${st._id}">
        <div class="student-info">
          <span class="roll-badge">${st.rollNo}</span>
          <div>
            <div class="student-name-text">${escapeHtml(st.name)}</div>
            <div class="student-sub-text">${st.gender || 'Student'} ${st.remarks ? `• <i>${escapeHtml(st.remarks)}</i>` : ''}</div>
          </div>
        </div>
        
        <div class="att-status-group">
          <button type="button" class="att-btn present ${status === 'present' ? 'active' : ''}" 
            onclick="setStudentStatus('${st._id}', 'present')">
            ✔ Present
          </button>
          <button type="button" class="att-btn absent ${status === 'absent' ? 'active' : ''}" 
            onclick="setStudentStatus('${st._id}', 'absent')">
            ✖ Absent
          </button>
          <button type="button" class="att-btn late ${status === 'late' ? 'active' : ''}" 
            onclick="setStudentStatus('${st._id}', 'late')">
            ⏳ Late
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function setStudentStatus(studentId, status) {
  if (!state.currentSession || !state.currentSession.students) return;

  const student = state.currentSession.students.find(s => s._id === studentId);
  if (student) {
    student.status = status;
    const card = document.querySelector(`.student-att-card[data-student-id="${studentId}"]`);
    if (card) {
      card.querySelectorAll('.att-btn').forEach(btn => {
        btn.classList.toggle('active', btn.classList.contains(status));
      });
    }
    updateAttendanceTally();
  }
}

function setAllStudentStatus(status) {
  if (!state.currentSession || !state.currentSession.students) return;

  state.currentSession.students.forEach(st => {
    st.status = status;
  });

  document.querySelectorAll('.student-att-card').forEach(card => {
    card.querySelectorAll('.att-btn').forEach(btn => {
      btn.classList.toggle('active', btn.classList.contains(status));
    });
  });

  updateAttendanceTally();
  showToast(`Marked all students as ${status}`, 'info');
}

function updateAttendanceTally() {
  if (!state.currentSession || !state.currentSession.students) return;

  const students = state.currentSession.students;
  const total = students.length;
  const present = students.filter(s => s.status === 'present').length;
  const absent = students.filter(s => s.status === 'absent').length;
  const late = students.filter(s => s.status === 'late').length;

  const rate = total > 0 ? Math.round(((present + (late * 0.5)) / total) * 100) : 0;

  const elTotal = document.getElementById('tally-total');
  const elPresent = document.getElementById('tally-present');
  const elAbsent = document.getElementById('tally-absent');
  const elLate = document.getElementById('tally-late');
  const elRate = document.getElementById('tally-rate');

  if (elTotal) elTotal.textContent = total;
  if (elPresent) elPresent.textContent = present;
  if (elAbsent) elAbsent.textContent = absent;
  if (elLate) elLate.textContent = late;
  if (elRate) elRate.textContent = `${rate}%`;
}

async function saveAttendanceSession() {
  if (!state.currentSession || !state.currentSession.students || state.currentSession.students.length === 0) {
    return showToast('No students to record attendance for', 'warning');
  }

  const date = document.getElementById('att-date')?.value;
  const classId = document.getElementById('att-class-select')?.value;
  const subjectId = document.getElementById('att-subject-select')?.value;
  const saveBtn = document.getElementById('btn-save-attendance');

  const records = state.currentSession.students.map(st => ({
    studentId: st._id,
    status: st.status || 'present',
    remarks: st.remarks || ''
  }));

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span>⏳</span> Saving...';
    }

    const res = await api.attendance.save({
      date,
      classId,
      subjectId,
      records,
      user: state.currentUser
    });

    showToast(res.message || 'Attendance saved successfully!', 'success');
    await loadAttendanceSession();
  } catch (err) {
    console.error('Error saving attendance:', err);
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>💾</span> Save Attendance';
    }
  }
}

// ==========================================
// Comprehensive Reports View (Filtering all/specific subjects, all years, months)
// ==========================================
async function initReportsView() {
  const repClass = document.getElementById('rep-class-select');
  if (repClass && repClass.value) {
    await updateSubjectDropdownForClass(repClass.value, 'rep-subject-select', true);
    generateReport();
  } else if (state.classes.length > 0) {
    repClass.value = state.classes[0]._id;
    await updateSubjectDropdownForClass(state.classes[0]._id, 'rep-subject-select', true);
    generateReport();
  }
}

async function generateReport() {
  const classId = document.getElementById('rep-class-select')?.value;
  const subjectId = document.getElementById('rep-subject-select')?.value || 'all';
  const year = document.getElementById('rep-year-select')?.value || 'all';
  const month = document.getElementById('rep-month-select')?.value || 'all';

  const container = document.getElementById('reports-content-container');
  if (!classId) {
    if (container) container.innerHTML = '<div class="empty-state"><p>Please select a class to view report.</p></div>';
    return;
  }

  if (container) {
    container.innerHTML = '<div class="empty-state"><p>Generating comprehensive attendance report...</p></div>';
  }

  try {
    const report = await api.reports.get({ classId, subjectId, year, month });

    // Populate Year selector with available years from server
    const yearSelect = document.getElementById('rep-year-select');
    if (yearSelect && report.availableYears) {
      const currentVal = yearSelect.value;
      let yrHtml = '<option value="all">All Years</option>';
      report.availableYears.forEach(y => {
        yrHtml += `<option value="${y}" ${String(y) === String(currentVal) ? 'selected' : ''}>${y}</option>`;
      });
      yearSelect.innerHTML = yrHtml;
    }

    renderReportCardsAndTable(report);
  } catch (err) {
    console.error('Error generating report:', err);
    if (container) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">Error: ${err.message}</p></div>`;
    }
  }
}

function renderReportCardsAndTable(report) {
  const container = document.getElementById('reports-content-container');
  if (!container) return;

  const totalStudents = report.totalStudents || 0;
  const totalSessions = report.totalSessions || 0;
  const classAvg = report.classAverage || 0;

  const excellentCount = report.studentReports.filter(s => s.percentage >= 85).length;
  const criticalCount = report.studentReports.filter(s => s.percentage < 75).length;

  let html = `
    <!-- Top Statistics Grid -->
    <div class="report-stats-grid">
      <div class="stat-box">
        <div class="val">${totalSessions}</div>
        <div class="lbl">Sessions Conducted</div>
      </div>
      <div class="stat-box">
        <div class="val">${classAvg}%</div>
        <div class="lbl">Class Average</div>
      </div>
      <div class="stat-box">
        <div class="val" style="color:var(--success)">${excellentCount}</div>
        <div class="lbl">High Attenders (≥85%)</div>
      </div>
      <div class="stat-box">
        <div class="val" style="color:var(--danger)">${criticalCount}</div>
        <div class="lbl">Attention Needed (&lt;75%)</div>
      </div>
    </div>
  `;

  // Subject breakdown pills if all subjects filtered
  if (report.subjectBreakdown && report.subjectBreakdown.length > 0) {
    html += `
      <div class="card" style="padding: 0.85rem; margin-bottom: 1rem;">
        <span class="form-label" style="margin-bottom:0.4rem;">Subject Breakdown</span>
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
          ${report.subjectBreakdown.map(sub => `
            <div style="background:var(--bg-input); padding:0.35rem 0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.8rem;">
              <strong>${escapeHtml(sub.subjectName)}:</strong> ${sub.averagePercentage}% (${sub.totalSessions} sessions)
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Student Attendance Table
  if (!report.studentReports || report.studentReports.length === 0) {
    html += `<div class="empty-state"><p>No students found for this class.</p></div>`;
  } else {
    html += `
      <div class="card" style="padding:0.75rem;">
        <div class="section-header" style="margin-bottom:0.75rem;">
          <h3 style="font-size:1.05rem;">Student Attendance Records (${report.studentReports.length})</h3>
          <span style="font-size:0.8rem; color:var(--text-muted);">Tap a student to view day-by-day session logs</span>
        </div>
        
        <div class="report-table-wrapper">
          <table class="report-table">
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Student Name</th>
                <th>Sessions</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Late</th>
                <th>Attendance %</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${report.studentReports.map(st => {
                let barClass = 'high';
                if (st.percentage < 60) barClass = 'low';
                else if (st.percentage < 75) barClass = 'mid';

                return `
                  <tr>
                    <td><span class="roll-badge">${st.rollNo}</span></td>
                    <td>
                      <strong>${escapeHtml(st.name)}</strong>
                      <div style="font-size:0.75rem; color:var(--text-muted);">${st.gender || ''}</div>
                    </td>
                    <td>${st.totalSessions}</td>
                    <td style="color:var(--success); font-weight:600;">${st.presentCount}</td>
                    <td style="color:var(--danger); font-weight:600;">${st.absentCount}</td>
                    <td style="color:var(--warning); font-weight:600;">${st.lateCount}</td>
                    <td style="min-width:110px;">
                      <strong>${st.percentage}%</strong>
                      <div class="pct-bar-wrap">
                        <div class="pct-bar-fill ${barClass}" style="width: ${st.percentage}%;"></div>
                      </div>
                    </td>
                    <td><span class="badge ${st.badgeClass}">${st.badge}</span></td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick='showStudentHistoryModal(${JSON.stringify(st).replace(/'/g, "&#39;")})'>
                        Logs
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

window.showStudentHistoryModal = function(student) {
  const modal = document.getElementById('modal-student-history');
  if (!modal) return;

  document.getElementById('history-modal-name').textContent = `${student.name} (Roll: ${student.rollNo})`;
  document.getElementById('history-modal-stats').innerHTML = `
    Attendance: <b>${student.percentage}%</b> | Total Sessions: <b>${student.totalSessions}</b> | Present: <b style="color:var(--success)">${student.presentCount}</b> | Absent: <b style="color:var(--danger)">${student.absentCount}</b> | Late: <b style="color:var(--warning)">${student.lateCount}</b>
  `;

  const logsContainer = document.getElementById('history-modal-logs');
  if (!student.sessionLogs || student.sessionLogs.length === 0) {
    logsContainer.innerHTML = '<p class="empty-state">No attendance sessions logged for this filter.</p>';
  } else {
    logsContainer.innerHTML = student.sessionLogs.map(log => {
      let color = 'var(--success)';
      if (log.status === 'absent') color = 'var(--danger)';
      else if (log.status === 'late') color = 'var(--warning)';

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid var(--border-color); font-size:0.85rem;">
          <div>
            <strong>${log.date}</strong> - ${escapeHtml(log.subjectName)}
            ${log.remarks ? `<div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(log.remarks)}</div>` : ''}
          </div>
          <span style="font-weight:700; color:${color}; text-transform:uppercase; font-size:0.8rem;">
            ${log.status}
          </span>
        </div>
      `;
    }).join('');
  }

  openModal('modal-student-history');
};

// ==========================================
// Students Management (CRUD)
// ==========================================
async function renderStudentsList() {
  const container = document.getElementById('students-list-container');
  if (!container) return;

  const classFilter = document.getElementById('student-class-filter')?.value || 'all';
  const query = document.getElementById('student-search-input')?.value || '';

  container.innerHTML = '<div class="empty-state"><p>Loading students...</p></div>';

  try {
    const students = await api.students.getAll({ classId: classFilter, q: query });
    state.students = students;

    if (students.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">👨‍🎓</div>
          <p>No students found.</p>
          <button class="btn btn-primary btn-sm" onclick="openModal('modal-add-student')" style="margin-top:0.5rem;">
            + Add New Student
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = students.map(st => {
      const clsName = st.classId ? `${st.classId.name} - ${st.classId.section}` : 'Unassigned';
      return `
        <div class="card" style="padding:0.9rem; margin-bottom:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <span class="roll-badge">${st.rollNo}</span>
              <div>
                <h4 style="font-size:1rem; font-weight:700;">${escapeHtml(st.name)}</h4>
                <div style="font-size:0.8rem; color:var(--text-muted);">
                  Class: <b>${escapeHtml(clsName)}</b> • Gender: ${st.gender || 'N/A'}
                </div>
                ${st.parentContact ? `<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:2px;">📞 <a href="tel:${st.parentContact}" style="color:#2dd4bf; text-decoration:none;">${escapeHtml(st.parentContact)}</a> (${escapeHtml(st.parentName || 'Parent')})</div>` : ''}
              </div>
            </div>
            
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-secondary btn-sm" onclick='editStudent(${JSON.stringify(st).replace(/'/g, "&#39;")})'>
                ✏️ Edit
              </button>
              <button class="btn btn-danger-outline btn-sm" onclick="deleteStudent('${st._id}', '${escapeHtml(st.name)}')">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error fetching students:', err);
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">Error: ${err.message}</p></div>`;
  }
}

window.editStudent = function(student) {
  document.getElementById('edit-student-id').value = student._id;
  document.getElementById('edit-student-name').value = student.name;
  document.getElementById('edit-student-roll').value = student.rollNo;
  document.getElementById('edit-student-class').value = student.classId ? (student.classId._id || student.classId) : '';
  document.getElementById('edit-student-gender').value = student.gender || 'Male';
  document.getElementById('edit-student-parent').value = student.parentName || '';
  document.getElementById('edit-student-phone').value = student.parentContact || '';
  document.getElementById('edit-student-email').value = student.email || '';

  // Populate edit class dropdown
  const select = document.getElementById('edit-student-class');
  select.innerHTML = state.classes.map(c => 
    `<option value="${c._id}" ${c._id === (student.classId?._id || student.classId) ? 'selected' : ''}>${c.name} - ${c.section}</option>`
  ).join('');

  openModal('modal-edit-student');
};

window.deleteStudent = async function(id, name) {
  if (!confirm(`Are you sure you want to remove student "${name}"? Attendance records for this student will be cleaned up.`)) {
    return;
  }
  try {
    await api.students.delete(id, state.currentUser);
    showToast(`Student "${name}" deleted`, 'success');
    renderStudentsList();
    loadCoreData();
  } catch (err) {
    showToast(`Failed to delete student: ${err.message}`, 'error');
  }
};

// ==========================================
// Classes Management (CRUD)
// ==========================================
async function renderClassesList() {
  const container = document.getElementById('classes-list-container');
  if (!container) return;

  container.innerHTML = '<div class="empty-state"><p>Loading classes...</p></div>';

  try {
    const classes = await api.classes.getAll();
    state.classes = classes;
    populateClassDropdowns();

    if (classes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">🏫</div>
          <p>No classes found.</p>
          <button class="btn btn-primary btn-sm" onclick="openModal('modal-add-class')" style="margin-top:0.5rem;">
            + Add New Class
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = classes.map(c => `
      <div class="card" style="padding:1rem; margin-bottom:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <h3 style="font-size:1.1rem; font-weight:700; color:#2dd4bf;">${escapeHtml(c.name)} - Section ${escapeHtml(c.section)}</h3>
            <div style="font-size:0.82rem; color:var(--text-muted); margin-top:0.2rem;">
              Academic Year: <b>${escapeHtml(c.academicYear)}</b> | Students: <b>${c.studentCount || 0}</b> | Subjects: <b>${c.subjectCount || 0}</b>
            </div>
            ${c.description ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.3rem;">${escapeHtml(c.description)}</div>` : ''}
          </div>
          
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-secondary btn-sm" onclick="filterStudentsByClass('${c._id}')">
              View Students
            </button>
            <button class="btn btn-secondary btn-sm" onclick='editClass(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
              ✏️
            </button>
            <button class="btn btn-danger-outline btn-sm" onclick="deleteClass('${c._id}', '${escapeHtml(c.name)}')">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error fetching classes:', err);
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">Error: ${err.message}</p></div>`;
  }
}

window.filterStudentsByClass = function(classId) {
  switchTab('students');
  const filter = document.getElementById('student-class-filter');
  if (filter) {
    filter.value = classId;
    renderStudentsList();
  }
};

window.editClass = function(cls) {
  document.getElementById('edit-class-id').value = cls._id;
  document.getElementById('edit-class-name').value = cls.name;
  document.getElementById('edit-class-section').value = cls.section;
  document.getElementById('edit-class-year').value = cls.academicYear;
  document.getElementById('edit-class-desc').value = cls.description || '';
  openModal('modal-edit-class');
};

window.deleteClass = async function(id, name) {
  if (!confirm(`Are you sure you want to delete class "${name}"? This will delete all enrolled students and attendance sessions for this class.`)) {
    return;
  }
  try {
    await api.classes.delete(id, state.currentUser);
    showToast(`Class "${name}" deleted`, 'success');
    await loadCoreData();
    renderClassesList();
  } catch (err) {
    showToast(`Failed to delete class: ${err.message}`, 'error');
  }
};

// ==========================================
// Subjects Management (CRUD)
// ==========================================
async function renderSubjectsList() {
  const container = document.getElementById('subjects-list-container');
  if (!container) return;

  container.innerHTML = '<div class="empty-state"><p>Loading subjects...</p></div>';

  try {
    const subjects = await api.subjects.getAll();
    state.subjects = subjects;

    if (subjects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📚</div>
          <p>No subjects found.</p>
          <button class="btn btn-primary btn-sm" onclick="openModal('modal-add-subject')" style="margin-top:0.5rem;">
            + Add New Subject
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = subjects.map(s => {
      const classTags = (s.classes && s.classes.length > 0)
        ? s.classes.map(c => `<span class="badge badge-info" style="margin-right:4px;">${c.name} ${c.section}</span>`).join('')
        : '<span class="badge" style="background:var(--bg-input);">All Classes</span>';

      return `
        <div class="card" style="padding:1rem; margin-bottom:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <h3 style="font-size:1.05rem; font-weight:700;">${escapeHtml(s.name)}</h3>
                ${s.code ? `<span class="roll-badge">${escapeHtml(s.code)}</span>` : ''}
              </div>
              <div style="margin-top:0.4rem;">${classTags}</div>
            </div>
            
            <div style="display:flex; gap:0.4rem;">
              <button class="btn btn-secondary btn-sm" onclick='editSubject(${JSON.stringify(s).replace(/'/g, "&#39;")})'>
                ✏️ Edit
              </button>
              <button class="btn btn-danger-outline btn-sm" onclick="deleteSubject('${s._id}', '${escapeHtml(s.name)}')">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error fetching subjects:', err);
    container.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">Error: ${err.message}</p></div>`;
  }
}

window.editSubject = function(subj) {
  document.getElementById('edit-subject-id').value = subj._id;
  document.getElementById('edit-subject-name').value = subj.name;
  document.getElementById('edit-subject-code').value = subj.code || '';

  // Render class checkboxes
  const classCheckboxContainer = document.getElementById('edit-subject-classes-container');
  const assignedIds = (subj.classes || []).map(c => c._id || c);
  classCheckboxContainer.innerHTML = state.classes.map(c => `
    <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.88rem; margin-bottom:0.4rem;">
      <input type="checkbox" name="edit-subject-classes" value="${c._id}" ${assignedIds.includes(c._id) ? 'checked' : ''}>
      ${c.name} - ${c.section}
    </label>
  `).join('');

  openModal('modal-edit-subject');
};

window.deleteSubject = async function(id, name) {
  if (!confirm(`Are you sure you want to delete subject "${name}"? Attendance records for this subject will be removed.`)) {
    return;
  }
  try {
    await api.subjects.delete(id, state.currentUser);
    showToast(`Subject "${name}" deleted`, 'success');
    await loadCoreData();
    renderSubjectsList();
  } catch (err) {
    showToast(`Failed to delete subject: ${err.message}`, 'error');
  }
};

// ==========================================
// Settings View (Roles, Clear Attendance, Reset App, Activities)
// ==========================================
async function renderSettingsView() {
  updateUserUI();

  // Populate activities list
  const activitiesContainer = document.getElementById('settings-activities-container');
  if (activitiesContainer) {
    activitiesContainer.innerHTML = '<p class="empty-state">Loading activities...</p>';
    try {
      const activities = await api.settings.getActivities(25);
      if (activities.length === 0) {
        activitiesContainer.innerHTML = '<p class="empty-state">No activities logged yet.</p>';
      } else {
        activitiesContainer.innerHTML = activities.map(act => {
          const time = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
          return `
            <div class="activity-item">
              <div class="activity-dot"></div>
              <div style="flex:1;">
                <div><strong>${escapeHtml(act.description)}</strong></div>
                <div class="activity-time">By ${escapeHtml(act.user?.name || 'User')} (${escapeHtml(act.user?.role || 'teacher')}) • ${time}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      activitiesContainer.innerHTML = `<p style="color:var(--danger)">Error loading activities: ${err.message}</p>`;
    }
  }

  // Populate system diagnostics
  try {
    const stats = await api.settings.getStats();
    const statEl = document.getElementById('settings-system-stats');
    if (statEl) {
      statEl.innerHTML = `
        <div style="font-size:0.85rem; line-height:1.7;">
          <div>Database Status: <b style="color:var(--success)">${stats.dbStatus}</b></div>
          <div>Total Classes: <b>${stats.totalClasses}</b></div>
          <div>Total Subjects: <b>${stats.totalSubjects}</b></div>
          <div>Total Active Students: <b>${stats.totalStudents}</b></div>
          <div>Recorded Attendance Sessions: <b>${stats.totalAttendanceSessions}</b></div>
          <div>Application Version: <b>v${stats.version}</b> (PWA Enabled)</div>
        </div>
      `;
    }
  } catch (err) {
    console.warn('Stats fetch notice:', err.message);
  }

  // Hook Clear Attendance Only button
  const btnClearAtt = document.getElementById('btn-clear-attendance-action');
  if (btnClearAtt) {
    btnClearAtt.onclick = async () => {
      const targetClass = document.getElementById('clear-attendance-class')?.value || 'all';
      if (!confirm(`Warning: Are you sure you want to CLEAR ATTENDANCE DATA ONLY? Students and classes will remain intact.`)) {
        return;
      }
      try {
        const res = await api.settings.clearAttendance(targetClass, state.currentUser);
        showToast(res.message || 'Attendance data cleared', 'success');
        closeModal('modal-clear-attendance');
        renderSettingsView();
        loadAttendanceSession();
      } catch (err) {
        showToast(`Failed to clear attendance: ${err.message}`, 'error');
      }
    };
  }

  // Hook Reset App button
  const btnResetApp = document.getElementById('btn-reset-app-action');
  if (btnResetApp) {
    btnResetApp.onclick = async () => {
      const confirmation = prompt('DANGER ZONE: Type "RESET" to confirm complete wipe of all students, classes, subjects, and attendance records:');
      if (confirmation !== 'RESET') {
        return showToast('Reset cancelled', 'info');
      }
      try {
        const res = await api.settings.resetApp(state.currentUser);
        showToast(res.message, 'success');
        closeModal('modal-reset-app');
        await loadCoreData();
        renderSettingsView();
        switchTab('attendance');
      } catch (err) {
        showToast(`Reset failed: ${err.message}`, 'error');
      }
    };
  }

  // Hook Seed Sample Data button
  const btnSeed = document.getElementById('btn-seed-sample-action');
  if (btnSeed) {
    btnSeed.onclick = async () => {
      try {
        btnSeed.disabled = true;
        btnSeed.textContent = 'Loading Sample Data...';
        const res = await api.settings.seedSample(state.currentUser);
        showToast(res.message, 'success');
        await loadCoreData();
        renderSettingsView();
        switchTab('attendance');
      } catch (err) {
        showToast(`Seed failed: ${err.message}`, 'error');
      } finally {
        btnSeed.disabled = false;
        btnSeed.textContent = '🌱 Load Demo School Data';
      }
    };
  }
}

// User Switching: Admin vs Teacher (Multi-User testing)
window.switchUserRole = async function(role) {
  try {
    const res = await api.auth.loginAs(
      role, 
      role === 'admin' ? 'Admin Noorudheen' : 'Teacher Fatima',
      role === 'admin' ? 'admin@hajar.edu' : 'teacher@hajar.edu'
    );
    state.currentUser = res.user;
    localStorage.setItem('hajar_user', JSON.stringify(res.user));
    updateUserUI();
    showToast(`Switched to ${res.user.role.toUpperCase()}: ${res.user.name}`, 'success');
    renderSettingsView();
  } catch (err) {
    showToast(`Failed to switch role: ${err.message}`, 'error');
  }
};

// ==========================================
// Google Authentication Integration (GIS)
// ==========================================
function initGoogleSignIn(clientId) {
  if (!clientId) return;
  cachedGoogleClientId = clientId;

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    // Retry in 250ms until script loaded
    setTimeout(() => initGoogleSignIn(clientId), 250);
    return;
  }

  try {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredentialResponse,
      auto_select: false
    });

    // Render in Settings container
    const settingsBtnContainer = document.getElementById('google-signin-btn-container');
    if (settingsBtnContainer) {
      settingsBtnContainer.innerHTML = '';
      google.accounts.id.renderButton(settingsBtnContainer, {
        theme: state.theme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill'
      });
    }

    // Render in Login Modal container
    const modalBtnContainer = document.getElementById('modal-google-btn-container');
    if (modalBtnContainer) {
      modalBtnContainer.innerHTML = '';
      google.accounts.id.renderButton(modalBtnContainer, {
        theme: state.theme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 360
      });
      const directBtn = document.getElementById('btn-modal-google-direct');
      if (directBtn) directBtn.style.display = 'none';
    }
  } catch (err) {
    console.warn('Google Identity initialization error:', err);
  }
}

async function handleGoogleCredentialResponse(response) {
  try {
    showToast('Verifying with Google...', 'info');
    const res = await api.auth.verifyGoogle(response.credential);
    if (res.success && res.user) {
      state.currentUser = res.user;
      localStorage.setItem('hajar_user', JSON.stringify(res.user));
      updateUserUI();
      closeModal('modal-auth');
      showToast(`Welcome ${res.user.name} (${res.user.role.toUpperCase()})!`, 'success');
      renderSettingsView();
      await loadCoreData();
    }
  } catch (err) {
    console.error('Google auth error:', err);
    showToast(`Google Sign-In failed: ${err.message}`, 'error');
    showModalAuthAlert(`Google Sign-In failed: ${err.message}`, 'error');
  }
}

// ==========================================
// Authentication Modal & Credentials Access
// ==========================================
window.openAuthModal = function(tab = 'signin') {
  switchModalAuthTab(tab);
  hideModalAuthAlert();
  openModal('modal-auth');

  // If user is already logged in, show close button; otherwise require login
  const closeBtn = document.getElementById('btn-close-auth-modal');
  if (closeBtn) {
    closeBtn.style.display = state.currentUser ? 'inline-flex' : 'none';
  }

  // Ensure Google button rendered
  if (cachedGoogleClientId) {
    initGoogleSignIn(cachedGoogleClientId);
  }
};

window.switchModalAuthTab = function(tab) {
  const tabSignin = document.getElementById('modal-tab-signin');
  const tabRegister = document.getElementById('modal-tab-register');
  const formSignin = document.getElementById('form-modal-signin');
  const formRegister = document.getElementById('form-modal-register');
  const modalTitle = document.getElementById('auth-modal-title');

  if (tab === 'signin') {
    if (tabSignin) { tabSignin.style.background = 'var(--primary-500)'; tabSignin.style.color = 'white'; }
    if (tabRegister) { tabRegister.style.background = 'transparent'; tabRegister.style.color = 'var(--text-secondary)'; }
    if (formSignin) formSignin.style.display = 'block';
    if (formRegister) formRegister.style.display = 'none';
    if (modalTitle) modalTitle.textContent = 'Sign In to Hajar App';
  } else {
    if (tabSignin) { tabSignin.style.background = 'transparent'; tabSignin.style.color = 'var(--text-secondary)'; }
    if (tabRegister) { tabRegister.style.background = 'var(--primary-500)'; tabRegister.style.color = 'white'; }
    if (formSignin) formSignin.style.display = 'none';
    if (formRegister) formRegister.style.display = 'block';
    if (modalTitle) modalTitle.textContent = 'Create New Account';
  }
  hideModalAuthAlert();
};

window.toggleModalPasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
};

function showModalAuthAlert(msg, type = 'error') {
  const alertEl = document.getElementById('modal-auth-alert');
  if (alertEl) {
    alertEl.textContent = msg;
    alertEl.style.display = 'block';
    if (type === 'error') {
      alertEl.style.background = 'var(--danger-bg)';
      alertEl.style.color = '#fca5a5';
      alertEl.style.border = '1px solid rgba(239, 68, 68, 0.4)';
    } else if (type === 'success') {
      alertEl.style.background = 'var(--success-bg)';
      alertEl.style.color = '#6ee7b7';
      alertEl.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    } else {
      alertEl.style.background = 'var(--info-bg)';
      alertEl.style.color = '#7dd3fc';
      alertEl.style.border = '1px solid rgba(14, 165, 233, 0.4)';
    }
  }
}

function hideModalAuthAlert() {
  const alertEl = document.getElementById('modal-auth-alert');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.textContent = '';
  }
}

window.handleModalPasswordLogin = async function(e) {
  e.preventDefault();
  const identifier = document.getElementById('modal-login-id').value.trim();
  const password = document.getElementById('modal-login-password').value;
  const submitBtn = document.getElementById('btn-modal-login-submit');

  if (!identifier || !password) {
    showModalAuthAlert('Please enter both User ID/Email and password.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';
  hideModalAuthAlert();

  try {
    const res = await api.auth.login(identifier, password);
    if (!res.success || !res.user) {
      throw new Error(res.error || 'Login failed');
    }

    state.currentUser = res.user;
    localStorage.setItem('hajar_user', JSON.stringify(res.user));
    updateUserUI();
    showToast(`Welcome back, ${res.user.name} (${res.user.role.toUpperCase()})!`, 'success');
    closeModal('modal-auth');
    renderSettingsView();
    await loadCoreData();
  } catch (err) {
    showModalAuthAlert(err.message || 'Login failed', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In with Credentials';
  }
};

window.handleModalRegistration = async function(e) {
  e.preventDefault();
  const name = document.getElementById('modal-reg-name').value.trim();
  const userId = document.getElementById('modal-reg-userid').value.trim();
  const role = document.getElementById('modal-reg-role').value;
  const email = document.getElementById('modal-reg-email').value.trim();
  const password = document.getElementById('modal-reg-password').value;
  const submitBtn = document.getElementById('btn-modal-reg-submit');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account...';
  hideModalAuthAlert();

  try {
    const res = await api.auth.register({ name, userId, role, email, password });
    if (!res.success || !res.user) {
      throw new Error(res.error || 'Registration failed');
    }

    state.currentUser = res.user;
    localStorage.setItem('hajar_user', JSON.stringify(res.user));
    updateUserUI();
    showToast(`Account created! Welcome, ${res.user.name}!`, 'success');
    closeModal('modal-auth');
    renderSettingsView();
    await loadCoreData();
  } catch (err) {
    showModalAuthAlert(err.message || 'Registration failed', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account & Sign In';
  }
};

window.quickModalLogin = async function(userId, password) {
  const submitBtn = document.getElementById('btn-modal-login-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';
  }
  hideModalAuthAlert();

  try {
    const res = await api.auth.login(userId, password);
    if (!res.success || !res.user) {
      throw new Error(res.error || 'Demo login failed');
    }

    state.currentUser = res.user;
    localStorage.setItem('hajar_user', JSON.stringify(res.user));
    updateUserUI();
    showToast(`Logged in as ${res.user.role.toUpperCase()}: ${res.user.name}`, 'success');
    closeModal('modal-auth');
    renderSettingsView();
    await loadCoreData();
  } catch (err) {
    showModalAuthAlert(err.message || 'Demo login failed', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In with Credentials';
    }
  }
};

window.handleLogout = async function() {
  try {
    if (state.currentUser) {
      await api.auth.logout(state.currentUser).catch(() => {});
    }
  } finally {
    state.currentUser = null;
    localStorage.removeItem('hajar_user');
    window.location.replace('/login.html?logout=true');
  }
};

// ==========================================
// Modal Form Submissions
// ==========================================
function setupFormSubmissions() {
  // Add Class Form
  const formAddClass = document.getElementById('form-add-class');
  if (formAddClass) {
    formAddClass.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('class-name').value;
      const section = document.getElementById('class-section').value;
      const academicYear = document.getElementById('class-year').value;
      const description = document.getElementById('class-desc').value;

      try {
        await api.classes.create({ name, section, academicYear, description, user: state.currentUser });
        showToast(`Class "${name} - ${section}" added!`, 'success');
        formAddClass.reset();
        closeModal('modal-add-class');
        await loadCoreData();
        if (state.activeTab === 'classes') renderClassesList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Edit Class Form
  const formEditClass = document.getElementById('form-edit-class');
  if (formEditClass) {
    formEditClass.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-class-id').value;
      const name = document.getElementById('edit-class-name').value;
      const section = document.getElementById('edit-class-section').value;
      const academicYear = document.getElementById('edit-class-year').value;
      const description = document.getElementById('edit-class-desc').value;

      try {
        await api.classes.update(id, { name, section, academicYear, description, user: state.currentUser });
        showToast(`Class updated successfully!`, 'success');
        closeModal('modal-edit-class');
        await loadCoreData();
        if (state.activeTab === 'classes') renderClassesList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Add Subject Form
  const formAddSubject = document.getElementById('form-add-subject');
  if (formAddSubject) {
    formAddSubject.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('subject-name').value;
      const code = document.getElementById('subject-code').value;

      const checkedClasses = Array.from(document.querySelectorAll('input[name="subject-classes"]:checked'))
        .map(el => el.value);

      try {
        await api.subjects.create({ name, code, classes: checkedClasses, user: state.currentUser });
        showToast(`Subject "${name}" added!`, 'success');
        formAddSubject.reset();
        closeModal('modal-add-subject');
        await loadCoreData();
        if (state.activeTab === 'subjects') renderSubjectsList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Edit Subject Form
  const formEditSubject = document.getElementById('form-edit-subject');
  if (formEditSubject) {
    formEditSubject.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-subject-id').value;
      const name = document.getElementById('edit-subject-name').value;
      const code = document.getElementById('edit-subject-code').value;

      const checkedClasses = Array.from(document.querySelectorAll('input[name="edit-subject-classes"]:checked'))
        .map(el => el.value);

      try {
        await api.subjects.update(id, { name, code, classes: checkedClasses, user: state.currentUser });
        showToast(`Subject updated!`, 'success');
        closeModal('modal-edit-subject');
        await loadCoreData();
        if (state.activeTab === 'subjects') renderSubjectsList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Add Student Form
  const formAddStudent = document.getElementById('form-add-student');
  if (formAddStudent) {
    formAddStudent.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('student-name').value;
      const rollNo = document.getElementById('student-roll').value;
      const classId = document.getElementById('modal-student-class').value;
      const gender = document.getElementById('student-gender').value;
      const parentName = document.getElementById('student-parent').value;
      const parentContact = document.getElementById('student-phone').value;
      const email = document.getElementById('student-email').value;

      try {
        await api.students.create({
          name, rollNo, classId, gender, parentName, parentContact, email,
          user: state.currentUser
        });
        showToast(`Student "${name}" added!`, 'success');
        formAddStudent.reset();
        closeModal('modal-add-student');
        if (state.activeTab === 'students') renderStudentsList();
        if (state.activeTab === 'attendance') loadAttendanceSession();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Edit Student Form
  const formEditStudent = document.getElementById('form-edit-student');
  if (formEditStudent) {
    formEditStudent.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-student-id').value;
      const name = document.getElementById('edit-student-name').value;
      const rollNo = document.getElementById('edit-student-roll').value;
      const classId = document.getElementById('edit-student-class').value;
      const gender = document.getElementById('edit-student-gender').value;
      const parentName = document.getElementById('edit-student-parent').value;
      const parentContact = document.getElementById('edit-student-phone').value;
      const email = document.getElementById('edit-student-email').value;

      try {
        await api.students.update(id, {
          name, rollNo, classId, gender, parentName, parentContact, email,
          user: state.currentUser
        });
        showToast(`Student updated!`, 'success');
        closeModal('modal-edit-student');
        if (state.activeTab === 'students') renderStudentsList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

// ==========================================
// Modal Helpers
// ==========================================
window.openModal = function(id) {
  // If opening Add Subject, populate classes checkboxes
  if (id === 'modal-add-subject') {
    const container = document.getElementById('add-subject-classes-container');
    if (container) {
      container.innerHTML = state.classes.map(c => `
        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.88rem; margin-bottom:0.4rem;">
          <input type="checkbox" name="subject-classes" value="${c._id}" checked>
          ${c.name} - ${c.section}
        </label>
      `).join('') || '<p style="font-size:0.8rem; color:var(--text-muted)">No classes created yet.</p>';
    }
  }

  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.closeModal = function(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

// ==========================================
// Toast Engine
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  else if (type === 'error') icon = '❌';
  else if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// PWA & Service Worker
// ==========================================
function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
        .catch(err => console.warn('[PWA] Service Worker error:', err));
    });
  }

  // Network Offline / Online detection
  const offlineChip = document.getElementById('offline-chip');
  function updateOnlineStatus() {
    if (offlineChip) {
      offlineChip.classList.toggle('active', !navigator.onLine);
    }
  }
  window.addEventListener('online', () => {
    updateOnlineStatus();
    showToast('Back online!', 'success');
  });
  window.addEventListener('offline', () => {
    updateOnlineStatus();
    showToast('You are currently offline', 'warning');
  });
  updateOnlineStatus();

  // Install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    const installBanner = document.getElementById('pwa-install-banner');
    if (installBanner) installBanner.style.display = 'flex';
  });

  const btnInstall = document.getElementById('btn-pwa-install');
  if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
      if (state.deferredPrompt) {
        state.deferredPrompt.prompt();
        const { outcome } = await state.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('Thank you for installing Hajar App!', 'success');
        }
        state.deferredPrompt = null;
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.display = 'none';
      }
    });
  }
}

// ==========================================
// Utilities
// ==========================================
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
