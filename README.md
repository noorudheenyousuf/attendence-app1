# Hajar App 🎓

> **A Mobile-First School Management & Student Attendance Progressive Web App (PWA)**  
> Built with HTML, CSS, JavaScript (Frontend) and Node.js with MongoDB (Backend). Ready for 1-click deployment.

---

## 🌟 Key Features

1. **Student Attendance Management**:
   - **Take Attendance**: Select Date, Class, and Subject to mark students as **Present**, **Absent**, or **Late**.
   - **Update Attendance**: Automatically detects past sessions and switches to **Update Mode** to edit records seamlessly.
   - **Bulk Actions**: One-click "Mark All Present" or "Mark All Absent".
   - **Real-Time Counters**: Instant tally of Total, Present, Absent, Late, and Class Attendance Rate %.

2. **Multi-Dimensional Attendance Reports**:
   - **Class Filtering**: Select any class/grade.
   - **Subject Filtering**: Filter by **All Subjects (Aggregate)** or inspect individual subjects.
   - **Academic Year Filtering**: View **All Years** or narrow down to a specific year.
   - **Month Filtering**: View **All Months** or filter by specific months (January to December).
   - **Interactive Visuals**: Percentage progress bars, status badges (`Excellent`, `Good`, `Warning`, `Critical`).
   - **Session Drilldown**: Tap any student's "Logs" to see day-by-day dates, subjects, and statuses.
   - **Export Options**: Download instant **CSV Spreadsheet** or **Print / Save PDF**.

3. **Complete CRUD Operations**:
   - **Students**: Add, Edit, Delete, Search by name/roll number, filter by class, parent contact details.
   - **Classes**: Add, Edit, Delete, track student count and subject count per class.
   - **Subjects**: Add, Edit, Delete, map subjects to specific classes or general curriculum.

4. **Secure Role-Based Administration**:
   - **Super Admin**: Full system access — user management, permission assignment, audit logs, all CRUD.
   - **Custom Admin**: Selective access to only the features the Super Admin explicitly grants.
   - **User**: Standard access to attendance marking, reports, and data management.
   - **Google Sign-In** and **Email/Password** authentication, both verified server-side.
   - Server-side RBAC + PBAC: client-supplied roles and permissions are never trusted.

5. **Settings & Maintenance**:
   - **Light / Dark Modes**: Responsive theme toggle with local storage persistence.
   - **🧹 Clear Attendance Data Only**: Permanently deletes attendance records while keeping all students, classes, and subjects intact.
   - **⚠️ Reset App Button**: Wipes application back to factory state with confirmation safeguard.
   - **🌱 Load Demo School Data**: 1-click bootstrap of 3 classes, 4 subjects, 8 students, and 20+ realistic attendance sessions — with automatic backup before overwrite.
   - **🕒 Activity Audit Log**: Chronological live feed of all operations performed across the app.
   - **💾 Backup & Restore**: Export and import full school data snapshots.

6. **Progressive Web App (PWA) Ready**:
   - Web App Manifest (`manifest.json`) with maskable icons and standalone display mode.
   - Service Worker (`sw.js`) caching core assets for fast loads and offline resilience.
   - "Install App" banner prompt for mobile and desktop browsers.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **MongoDB** (Local MongoDB instance or free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)

### 2. Installation
```bash
# Navigate to the project directory
cd "hajar app"

# Install dependencies
npm install
```

### 3. Environment Configuration
Edit `.env` (a template is provided in `.env.example`):
```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/hajar_app

# Authentication — required for secure token signing
TOKEN_SECRET=replace-with-a-long-random-secret-string

# Google Sign-In (optional)
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com

# Super Admin bootstrap (see section below)
SUPER_ADMIN_EMAIL=your-admin-email@school.edu
ADMIN_SETUP_KEY=replace-with-a-strong-one-time-setup-key

NODE_ENV=development
```

> **Note for MongoDB Atlas**: Replace `MONGODB_URI` with your connection string:
> `mongodb+srv://<username>:<password>@cluster0.mongodb.net/hajar_app?retryWrites=true&w=majority`

### 4. Running the Application
```bash
# Start server in production mode
npm start

# Or run with live file watcher in development mode
npm run dev
```

Visit **`http://localhost:3000`** in your browser!

---

## 🛡️ Admin & Permission Management System

Hajar implements a layered, server-enforced Role-Based + Permission-Based Access Control (RBAC + PBAC) system.

### Role Hierarchy

| Role | Symbol | Description |
|------|--------|-------------|
| `super_admin` | 👑 | Primary owner. Full system access. Cannot be demoted, suspended, or deleted. |
| `admin` | 🛡️ | Custom admin. Access restricted to only permissions Super Admin explicitly granted. |
| `user` | 👤 | Standard school user. Access to attendance, reports, and data management. |

Every new registration always receives the `user` role. Roles are **never** accepted from the client.

---

### Permission Registry

Custom Admins can be granted any combination of these permissions:

| Permission Key | Description |
|----------------|-------------|
| `attendance.mark` | Mark and update attendance sessions |
| `attendance.clear` | Clear all attendance records |
| `classes.manage` | Create, edit, and delete classes |
| `subjects.manage` | Create, edit, and delete subjects |
| `students.manage` | Create, edit, and delete students |
| `reports.view` | View and export attendance reports |
| `users.view` | View the registered users list |
| `users.delete` | Permanently delete user accounts |
| `settings.view` | Access the Settings panel |
| `settings.manage` | Reset app, load demo data, restore backups |
| `admins.manage` | Promote/demote admins, assign permissions |

> **Super Admins bypass all permission checks.** Custom Admins start with zero permissions after promotion and must be explicitly granted each one by the Super Admin.

---

### Bootstrapping the First Super Admin

#### Option A — Via API (MongoDB mode, production)

1. Set these in your `.env` before starting the server:
   ```env
   SUPER_ADMIN_EMAIL=your-email@school.edu
   ADMIN_SETUP_KEY=a-long-secret-key-you-choose
   ```

2. Register an account using that email address through the normal sign-up flow.

3. Call the one-time initialization endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/auth/init-super-admin \
     -H "Content-Type: application/json" \
     -d '{"email": "your-email@school.edu", "setupKey": "a-long-secret-key-you-choose"}'
   ```

4. The endpoint is atomic — it rejects concurrent or repeated calls once a Super Admin already exists. Subsequent calls return `403 Forbidden`.

5. After initialization, remove or rotate `ADMIN_SETUP_KEY` from your environment.

#### Option B — In-Memory / Development Mode

When MongoDB is unavailable (in-memory fallback), the store is pre-seeded with:

| Account | Login ID | Password | Role |
|---------|----------|----------|------|
| Super Admin | `admin` | `admin123` | `super_admin` |
| Normal User | `teacher` | `teacher123` | `user` |

Use `POST /api/auth/login-as` with `{"userId": "admin"}` to get a token without a password (development only).

> ⚠️ **In-memory data is lost on server restart.** A warning banner is shown in the UI when running in this mode. Never store real school data in-memory mode.

---

### Admin Management API

All endpoints require `Authorization: Bearer <token>`.

| Method | Path | Required Permission | Description |
|--------|------|---------------------|-------------|
| `GET` | `/api/admin/permissions` | Any authenticated user | Get full permission registry |
| `GET` | `/api/admin/users` | `users.view` | Paginated, searchable user list |
| `GET` | `/api/admin/users/:id` | `users.view` | Single user details |
| `POST` | `/api/admin/users/:id/promote` | `admins.manage` | Promote user to Custom Admin |
| `POST` | `/api/admin/users/:id/demote` | `admins.manage` | Demote Custom Admin to normal user |
| `PATCH` | `/api/admin/users/:id/permissions` | Super Admin only | Assign/revoke individual permissions |
| `PATCH` | `/api/admin/users/:id/status` | `admins.manage` | Suspend or reactivate an account |
| `DELETE` | `/api/admin/users/:id` | `users.delete` | Permanently delete a user account |
| `GET` | `/api/admin/audit-logs` | `settings.view` | Paginated security audit trail |

**Query parameters for `GET /api/admin/users`**:
- `q` — search by name, email, or userId
- `role` — filter by `super_admin`, `admin`, `user`, or `all` (default)
- `status` — filter by `active`, `suspended`, or `all` (default)
- `page` — page number (default: `1`)
- `limit` — results per page (default: `10`, max: `100`)

---

### Security Properties

| Property | Implementation |
|----------|---------------|
| Server-side enforcement | All checks in `authenticateUser` + `requirePermission()` middleware — UI hiding is never the only guard |
| Fresh role loads | `authenticateUser` reloads user from DB on every request — role changes take effect immediately |
| Super Admin protection | `isSuperAdminProtected: true` blocks demote, suspend, and delete on the primary account |
| Last-admin safeguard | Demoting the last remaining Custom Admin is explicitly blocked with a descriptive error |
| Self-modification blocked | Custom Admins cannot modify their own permissions or role |
| Audit trail | Every promote, demote, permission change recorded in `Activity` with actor, target, action, timestamp |
| No role in registration | `role` field is stripped from all registration requests on the server |
| Password hashing | All passwords hashed with bcrypt before storage — plaintext never persisted |
| JWT-like tokens | HMAC-SHA256 signed tokens; `authenticateUser` always re-validates role from DB, not just the token |

---

### Running the Automated Test Suite

```bash
node server/test_admin_system.js
```

The suite runs **27 automated tests** covering all 11 security objectives:

- ✅ Registration with ignored client-supplied role/permissions
- ✅ Super Admin initialization and re-initialization rejection
- ✅ Role-based access control (403 for unauthorized access)
- ✅ Promotion and demotion flows
- ✅ Granular permission assignment and enforcement
- ✅ Permission revocation on demotion (immediate effect)
- ✅ Super Admin account protection (demote/suspend/delete all blocked)
- ✅ Audit log recording of all sensitive actions

Expected output: `27 / 27 PASSED`

---

## 🌐 Deployment Ready (Render, Railway, Heroku)

### Deploying to Render.com (Recommended Free Tier)
1. Push your repository to GitHub.
2. Sign in to [Render](https://render.com) and click **New + > Web Service**.
3. Select your repository.
4. Set the following build settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. In **Environment Variables**, add:
   - `MONGODB_URI`: Your MongoDB Atlas connection URI
   - `TOKEN_SECRET`: A long random string — generate with `openssl rand -hex 32`
   - `SUPER_ADMIN_EMAIL`: Your admin email address
   - `ADMIN_SETUP_KEY`: A secret key used to claim the Super Admin role once
   - `GOOGLE_CLIENT_ID`: Your Google Cloud OAuth Client ID (optional)
   - `NODE_ENV`: `production`
6. Deploy. Render provides a free SSL `https://...` URL which enables full PWA installation.
7. After the first deploy, call `POST /api/auth/init-super-admin` to claim the Super Admin role, then remove `ADMIN_SETUP_KEY` from environment variables.

---

## 🔑 Setting Up Google Authentication (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and configure **APIs & Services > Credentials**.
3. Create an **OAuth 2.0 Client ID** (Web application).
4. Add your authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://your-domain.onrender.com`
5. Copy the Client ID and paste it into `.env`:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

---

## 📁 Project Structure

```
hajar-app/
├── server/
│   ├── config/
│   │   ├── db.js                 # MongoDB Mongoose connection
│   │   ├── memoryStore.js        # In-memory fallback store (when MongoDB offline)
│   │   └── permissions.js        # RBAC permission registry and validator
│   ├── middleware/
│   │   └── authMiddleware.js     # authenticateUser, requireAdmin, requirePermission
│   ├── models/
│   │   ├── User.js               # User schema: role, permissions, isSuperAdminProtected
│   │   ├── Class.js              # Class and Grade schema
│   │   ├── Subject.js            # Curriculum subject schema
│   │   ├── Student.js            # Student details & roll number schema
│   │   ├── Attendance.js         # Daily attendance sessions schema
│   │   └── Activity.js           # Audit activity log schema
│   ├── routes/
│   │   ├── authRoutes.js         # Google Auth, login, register, init-super-admin
│   │   ├── adminRoutes.js        # User management, permission assignment, audit logs
│   │   ├── classRoutes.js        # Class CRUD (RBAC protected)
│   │   ├── subjectRoutes.js      # Subject CRUD (RBAC protected)
│   │   ├── studentRoutes.js      # Student CRUD (RBAC protected)
│   │   ├── attendanceRoutes.js   # Attendance marking & updating (RBAC protected)
│   │   ├── reportRoutes.js       # Multi-dimensional reporting & CSV export
│   │   └── settingRoutes.js      # Clear attendance, reset, activities (RBAC protected)
│   ├── utils/
│   │   ├── authHelper.js         # Token generation/verification, sanitizeUser
│   │   └── logger.js             # Activity logger utility
│   ├── test_admin_system.js      # Automated test suite (27 tests)
│   └── server.js                 # Express server & static asset serving
├── public/
│   ├── index.html                # Single-page mobile-responsive web app
│   ├── manifest.json             # PWA Web App Manifest
│   ├── sw.js                     # Service Worker for offline caching
│   ├── css/
│   │   └── style.css             # Light & Dark theme responsive styling
│   ├── js/
│   │   ├── api.js                # Frontend REST API client
│   │   └── app.js                # Core UI logic, state & modal managers, Admin UI
│   └── assets/
│       └── icons/
│           └── icon.svg          # High-resolution vector PWA app icon
├── .env.example
├── .env
├── package.json
└── README.md
```

---

## 🛡️ License
MIT License. Created for high-efficiency school and classroom management.
