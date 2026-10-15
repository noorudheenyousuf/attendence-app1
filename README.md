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
   - **Subject Filtering**: Filter by **All Subjects (Aggregate)** or inspect individual subjects (e.g. Mathematics, Science).
   - **Academic Year Filtering**: View **All Years** or narrow down to a specific year (e.g. 2026, 2025).
   - **Month Filtering**: View **All Months** or filter by specific months (January to December).
   - **Interactive Visuals**: Percentage progress bars, status badges (`Excellent`, `Good`, `Warning`, `Critical`).
   - **Session Drilldown**: Tap any student's "Logs" to see day-by-day dates, subjects, and statuses.
   - **Export Options**: Download instant **CSV Spreadsheet** or **Print / Save PDF**.

3. **Complete CRUD Operations**:
   - **Students**: Add, Edit, Delete, Search by name/roll number, filter by class, parent contact details.
   - **Classes**: Add, Edit, Delete, track student count and subject count per class.
   - **Subjects**: Add, Edit, Delete, map subjects to specific classes or general curriculum.

4. **Multi-User Experience & Google Authentication**:
   - **Role-Based Experience**:
     - **Admin**: Complete system controls (system reset, clear attendance, activity logs, user management).
     - **Teachers**: Full access to take attendance, edit past attendance, view and export reports, manage students/classes/subjects.
   - **Google Authentication**: Ready with Google Identity Services (`GOOGLE_CLIENT_ID`).
   - **Instant Role Switcher**: Quick-switch buttons in Settings to test Admin and Teacher experiences instantly.

5. **Navigation Architecture (As Requested)**:
   - **Top Navigation Bar**: `[📋 Attendance]`, `[📊 Reports]`, `[⚙️ Settings]`
   - **Bottom Navigation Bar (Mobile-first Dock)**: `[👨‍🎓 Students]`, `[🏫 Classes]`, `[➕ Quick Add]`, `[📚 Subjects]`, `[📋 Attendance]`

6. **Settings & Maintenance**:
   - **Light / Dark Modes**: Responsive theme toggle with local storage persistence.
   - **🧹 Clear Attendance Data Only**: Permanently deletes attendance records while keeping all students, classes, and subjects intact.
   - **⚠️ Reset App Button**: Wipes application back to factory state with confirmation safeguard.
   - **🌱 Load Demo School Data**: 1-click bootstrap of 3 classes, 4 subjects, 8 students, and 20+ realistic attendance sessions.
   - **🕒 Activity Audit Log**: Chronological live feed of all operations performed across the app.

7. **Progressive Web App (PWA) Ready**:
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
# Clone or navigate to the project directory
cd "hajar app"

# Install dependencies
npm install
```

### 3. Environment Configuration
Edit `.env` (a template is provided in `.env.example`):
```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/hajar_app
ADMIN_EMAIL=admin@hajar.edu
GOOGLE_CLIENT_ID=
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
   - `MONGODB_URI`: (Your MongoDB Atlas connection URI)
   - `ADMIN_EMAIL`: (Your admin Google email)
   - `GOOGLE_CLIENT_ID`: (Your Google Cloud OAuth Client ID, optional)
   - `NODE_ENV`: `production`
6. Click **Deploy Web Service**. Render provides a free SSL `https://...` URL which enables full PWA installation!

---

## 🔑 Setting Up Google Authentication (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project and configure **APIs & Services > Credentials**.
3. Create an **OAuth 2.0 Client ID** (Web application).
4. Add your authorized Javascript origins:
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
│   │   └── db.js                 # MongoDB Mongoose connection
│   ├── models/
│   │   ├── User.js               # User and Role schema
│   │   ├── Class.js              # Class and Grade schema
│   │   ├── Subject.js            # Curriculum subject schema
│   │   ├── Student.js            # Student details & roll number schema
│   │   ├── Attendance.js         # Daily attendance sessions schema
│   │   └── Activity.js           # Audit activity log schema
│   ├── routes/
│   │   ├── authRoutes.js         # Google Auth & login routes
│   │   ├── classRoutes.js        # Class CRUD endpoints
│   │   ├── subjectRoutes.js      # Subject CRUD endpoints
│   │   ├── studentRoutes.js      # Student CRUD endpoints
│   │   ├── attendanceRoutes.js   # Attendance session marking & updating
│   │   ├── reportRoutes.js       # Multi-dimensional reporting & CSV export
│   │   └── settingRoutes.js      # Clear attendance, reset app, activities
│   ├── utils/
│   │   └── logger.js             # Activity logger utility
│   └── server.js                 # Express server & static asset serving
├── public/
│   ├── index.html                # Single-page mobile-responsive web app
│   ├── manifest.json             # PWA Web App Manifest
│   ├── sw.js                     # Service Worker for offline caching
│   ├── css/
│   │   └── style.css             # Light & Dark theme responsive styling
│   ├── js/
│   │   ├── api.js                # Frontend REST API client
│   │   └── app.js                # Core UI logic, state & modal managers
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
