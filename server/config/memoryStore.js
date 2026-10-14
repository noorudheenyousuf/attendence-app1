const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const storeContext = new AsyncLocalStorage();

function generateId() {
  return 'mem_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function matchQuery(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;

  if (query.$or && Array.isArray(query.$or)) {
    return query.$or.some(subQuery => matchQuery(doc, subQuery));
  }

  for (const [key, val] of Object.entries(query)) {
    if (key === '$or') continue;
    if (val === undefined) continue;

    const docVal = doc[key];

    // Check if docVal is an array (e.g. classes: [classId1, classId2])
    if (Array.isArray(docVal)) {
      const matchInArray = docVal.some(item => {
        const itemStr = item && item._id ? item._id.toString() : (item !== undefined ? item.toString() : '');
        const valStr = val && val._id ? val._id.toString() : (val !== undefined ? val.toString() : '');
        return itemStr === valStr;
      });
      if (!matchInArray) return false;
      continue;
    }

    // Check if val is an object with _id
    if (val && typeof val === 'object' && val._id) {
      if ((docVal ? docVal.toString() : '') !== val._id.toString()) return false;
      continue;
    }

    // Check if docVal is an object with _id
    if (docVal && typeof docVal === 'object' && docVal._id) {
      if (docVal._id.toString() !== (val !== undefined ? val.toString() : '')) return false;
      continue;
    }

    if (val instanceof RegExp) {
      if (!val.test(docVal || '')) return false;
      continue;
    }

    if (typeof val === 'boolean') {
      if (Boolean(docVal) !== val) return false;
      continue;
    }

    const docStr = docVal !== undefined && docVal !== null ? docVal.toString().toLowerCase() : '';
    const valStr = val !== undefined && val !== null ? val.toString().toLowerCase() : '';
    if (docStr !== valStr) {
      return false;
    }
  }

  return true;
}

class QueryChain {
  constructor(items, isSingle = false, store = null) {
    this._items = items ? [...items] : [];
    this._isSingle = isSingle;
    this._sortObj = null;
    this._skipNum = null;
    this._limitNum = null;
    this._populates = [];
    this._store = store;
  }

  sort(sortObj) {
    this._sortObj = sortObj;
    return this;
  }

  skip(n) {
    this._skipNum = n;
    return this;
  }

  limit(n) {
    this._limitNum = n;
    return this;
  }

  lean() {
    return this;
  }

  populate(field, select) {
    this._populates.push({ field, select });
    return this;
  }

  _exec() {
    let result = [...this._items];

    // Sorting
    if (this._sortObj) {
      const [field, dir] = Object.entries(this._sortObj)[0];
      result.sort((a, b) => {
        let va = a[field] ?? '';
        let vb = b[field] ?? '';
        if (va instanceof Date) va = va.getTime();
        if (vb instanceof Date) vb = vb.getTime();
        return dir === -1 ? (vb > va ? 1 : vb < va ? -1 : 0) : (va > vb ? 1 : va < vb ? -1 : 0);
      });
    }

    // Skipping
    if (this._skipNum && this._skipNum > 0) {
      result = result.slice(this._skipNum);
    }

    // Limiting
    if (this._limitNum && this._limitNum > 0) {
      result = result.slice(0, this._limitNum);
    }

    // Populating
    if (this._populates.length > 0 && this._store) {
      result = result.map(doc => {
        const clone = { ...doc };
        for (const { field } of this._populates) {
          if (field === 'classId') {
            const rawId = clone.classId && clone.classId._id ? clone.classId._id : clone.classId;
            const cls = this._store.classes.items.find(c => c._id.toString() === (rawId ? rawId.toString() : ''));
            if (cls) clone.classId = { _id: cls._id, name: cls.name, section: cls.section };
          } else if (field === 'subjectId') {
            const rawId = clone.subjectId && clone.subjectId._id ? clone.subjectId._id : clone.subjectId;
            const sub = this._store.subjects.items.find(s => s._id.toString() === (rawId ? rawId.toString() : ''));
            if (sub) clone.subjectId = { _id: sub._id, name: sub.name, code: sub.code };
          } else if (field === 'records.studentId' && Array.isArray(clone.records)) {
            clone.records = clone.records.map(rec => {
              const rawStdId = rec.studentId && rec.studentId._id ? rec.studentId._id : rec.studentId;
              const std = this._store.students.items.find(st => st._id.toString() === (rawStdId ? rawStdId.toString() : ''));
              return {
                ...rec,
                studentId: std ? { _id: std._id, name: std.name, rollNo: std.rollNo, gender: std.gender, parentContact: std.parentContact } : rec.studentId
              };
            });
          }
        }
        return clone;
      });
    }

    return this._isSingle ? (result[0] || null) : result;
  }

  then(resolve, reject) {
    try {
      resolve(this._exec());
    } catch (e) {
      reject(e);
    }
  }
}

class InMemoryCollection {
  constructor(name, store = null) {
    this.name = name;
    this.items = [];
    this.store = store;
  }

  find(query = {}) {
    const matched = this.items.filter(item => matchQuery(item, query));
    return new QueryChain(matched.map(item => this._wrapDoc(item)), false, this.store);
  }

  findOne(query = {}) {
    const matched = this.items.filter(item => matchQuery(item, query));
    const first = matched[0] ? this._wrapDoc(matched[0]) : null;
    return new QueryChain(first ? [first] : [], true, this.store);
  }

  findById(id) {
    if (!id) return new QueryChain([], true, this.store);
    const strId = (id && id._id ? id._id : id).toString();
    const found = this.items.find(item => item._id && item._id.toString() === strId);
    return new QueryChain(found ? [this._wrapDoc(found)] : [], true, this.store);
  }

  async exists(query = {}) {
    return Boolean(this.items.some(item => matchQuery(item, query)));
  }

  async countDocuments(query = {}) {
    return this.items.filter(item => matchQuery(item, query)).length;
  }

  async create(data) {
    if (Array.isArray(data)) {
      return data.map(d => this._insertItem(d));
    }
    return this._insertItem(data);
  }

  async insertMany(data) {
    if (Array.isArray(data)) {
      return data.map(d => this._insertItem(d));
    }
    return [this._insertItem(data)];
  }

  async findOneAndUpdate(query, update, options = {}) {
    let idx = this.items.findIndex(item => matchQuery(item, query));
    if (idx === -1) {
      if (options.upsert) {
        const patch = update && update.$set ? { ...update.$set } : { ...update };
        const newItem = { ...query, ...patch, _id: generateId(), createdAt: new Date() };
        return this._insertItem(newItem);
      }
      return null;
    }
    const current = this.items[idx];
    const patch = update && update.$set ? { ...update.$set } : { ...update };
    delete patch._id;
    const updated = { ...current, ...patch, updatedAt: new Date() };
    this.items[idx] = updated;
    return this._wrapDoc(updated);
  }

  async findByIdAndUpdate(id, update, options = {}) {
    const strId = (id && id._id ? id._id : id).toString();
    const idx = this.items.findIndex(item => item._id && item._id.toString() === strId);
    if (idx === -1) return null;
    const current = this.items[idx];
    const patch = update && update.$set ? { ...update.$set } : { ...update };
    delete patch._id;
    const updated = { ...current, ...patch, updatedAt: new Date() };
    this.items[idx] = updated;
    return this._wrapDoc(updated);
  }

  async findByIdAndDelete(id) {
    const strId = (id && id._id ? id._id : id).toString();
    const idx = this.items.findIndex(item => item._id && item._id.toString() === strId);
    if (idx === -1) return null;
    const removed = this.items.splice(idx, 1)[0];
    return this._wrapDoc(removed);
  }

  async deleteMany(query = {}) {
    const originalLen = this.items.length;
    this.items = this.items.filter(item => !matchQuery(item, query));
    return { deletedCount: originalLen - this.items.length };
  }

  _insertItem(data) {
    const item = {
      _id: data._id || generateId(),
      ...data,
      createdAt: data.createdAt || new Date()
    };
    if (item.password && !item.password.startsWith('$2a$') && !item.password.startsWith('$2b$')) {
      item.password = bcrypt.hashSync(item.password, 10);
    }
    this.items.push(item);
    return this._wrapDoc(item);
  }

  _wrapDoc(rawDoc) {
    const self = this;
    const wrapped = {
      ...rawDoc,
      _id: rawDoc._id,
      toObject() {
        return { ...this };
      },
      toJSON() {
        const obj = { ...this };
        delete obj.password;
        return obj;
      },
      async comparePassword(candidate) {
        if (!this.password) return false;
        try {
          return bcrypt.compareSync(candidate, this.password);
        } catch (_) {
          return this.password === candidate;
        }
      },
      hasPermission(permission) {
        if (this.role === 'super_admin') return true;
        if (this.isActive === false) return false;
        if (!this.permissions || !Array.isArray(this.permissions)) return false;
        if (this.permissions.includes('*')) return true;
        return this.permissions.includes(permission);
      },
      async save() {
        if (!this._id) {
          this._id = generateId();
        }
        if (this.role === 'teacher') {
          this.role = 'user';
        }
        if (this.password && !this.password.startsWith('$2a$') && !this.password.startsWith('$2b$')) {
          this.password = bcrypt.hashSync(this.password, 10);
        }
        const idx = self.items.findIndex(it => it._id && it._id.toString() === this._id.toString());
        if (idx !== -1) {
          self.items[idx] = { ...this };
        } else {
          self.items.push({ ...this });
        }
        return this;
      }
    };
    return wrapped;
  }
}

class MemoryStore {
  constructor(options = {}) {
    this.isDemo = Boolean(options.isDemo);
    this.users = new InMemoryCollection('users', this);
    this.classes = new InMemoryCollection('classes', this);
    this.subjects = new InMemoryCollection('subjects', this);
    this.students = new InMemoryCollection('students', this);
    this.attendances = new InMemoryCollection('attendances', this);
    this.activities = new InMemoryCollection('activities', this);
    this.backups = new InMemoryCollection('backups', this);

    this.seedDefaultData();
  }

  seedDefaultData() {
    const adminPassHash = bcrypt.hashSync('admin123', 10);
    const teacherPassHash = bcrypt.hashSync('teacher123', 10);
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@hajar.edu').toLowerCase();

    this.users.items = [
      {
        _id: this.isDemo ? 'mem_demo_admin' : 'mem_admin_01',
        userId: 'admin',
        name: this.isDemo ? 'Demo Super Admin Noorudheen' : 'Admin Noorudheen',
        email: superAdminEmail,
        password: adminPassHash,
        role: 'super_admin',
        permissions: ['*'],
        isActive: true,
        isEmailVerified: true,
        isSuperAdminProtected: true,
        avatar: '/black coat.jpeg',
        createdAt: new Date(),
        lastLogin: new Date()
      },
      {
        _id: this.isDemo ? 'mem_demo_teacher' : 'mem_teacher_01',
        userId: 'teacher',
        name: 'Teacher Fatima',
        email: 'teacher@hajar.edu',
        password: teacherPassHash,
        role: 'user',
        permissions: ['attendance.view', 'attendance.mark', 'classes.view', 'subjects.view', 'students.view', 'reports.view'],
        isActive: true,
        isEmailVerified: true,
        isSuperAdminProtected: false,
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=teacher@hajar.edu',
        createdAt: new Date(),
        lastLogin: new Date()
      }
    ];

    const prefix = this.isDemo ? 'demo_' : 'mem_';
    const classAId = `${prefix}cls_10a`;
    const classBId = `${prefix}cls_10b`;
    const classCId = `${prefix}cls_9a`;

    this.classes.items = [
      { _id: classAId, name: this.isDemo ? 'Demo Grade 10' : 'Grade 10', section: 'A', academicYear: '2026', description: 'Senior Secondary Science & Maths', createdAt: new Date() },
      { _id: classBId, name: this.isDemo ? 'Demo Grade 10' : 'Grade 10', section: 'B', academicYear: '2026', description: 'Senior Secondary Arts & Commerce', createdAt: new Date() },
      { _id: classCId, name: this.isDemo ? 'Demo Grade 9' : 'Grade 9', section: 'A', academicYear: '2026', description: 'Junior High', createdAt: new Date() }
    ];

    const mathId = `${prefix}sub_math`;
    const sciId = `${prefix}sub_sci`;
    const engId = `${prefix}sub_eng`;

    this.subjects.items = [
      { _id: mathId, name: 'Mathematics', code: 'MATH101', classes: [classAId, classBId, classCId], createdAt: new Date() },
      { _id: sciId, name: 'Science & Physics', code: 'SCI102', classes: [classAId, classBId], createdAt: new Date() },
      { _id: engId, name: 'English Language', code: 'ENG103', classes: [classAId, classBId, classCId], createdAt: new Date() }
    ];

    const rawStudents = [
      { name: 'Amina Al-Hajar', rollNo: '10A-01', gender: 'Female', parentContact: '+1 555-0101', parentName: 'Fatima Al-Hajar', email: 'amina@example.com' },
      { name: 'Bilal Tariq', rollNo: '10A-02', gender: 'Male', parentContact: '+1 555-0102', parentName: 'Tariq Mansoor', email: 'bilal@example.com' },
      { name: 'Chirag Sharma', rollNo: '10A-03', gender: 'Male', parentContact: '+1 555-0103', parentName: 'Raj Sharma', email: 'chirag@example.com' },
      { name: 'Diana Prince', rollNo: '10A-04', gender: 'Female', parentContact: '+1 555-0104', parentName: 'Hippolyta Prince', email: 'diana@example.com' },
      { name: 'Ebrahim Zaid', rollNo: '10A-05', gender: 'Male', parentContact: '+1 555-0105', parentName: 'Zaid Omar', email: 'ebrahim@example.com' },
      { name: 'Fatima Zahra', rollNo: '10A-06', gender: 'Female', parentContact: '+1 555-0106', parentName: 'Ali Raza', email: 'fatima@example.com' },
      { name: 'Ghufran Malik', rollNo: '10A-07', gender: 'Male', parentContact: '+1 555-0107', parentName: 'Malik Akbar', email: 'ghufran@example.com' },
      { name: 'Hajar Noora', rollNo: '10A-08', gender: 'Female', parentContact: '+1 555-0108', parentName: 'Noorudheen', email: 'hajar.noora@example.com' }
    ];

    this.students.items = rawStudents.map((s, idx) => ({
      _id: `${prefix}std_${idx + 1}`,
      ...s,
      classId: classAId,
      isActive: true,
      createdAt: new Date()
    }));

    // Seed recent attendance
    const today = new Date();
    for (let i = 5; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dStr = `${yyyy}-${mm}-${dd}`;

        const records = this.students.items.map((st, idx) => {
          let status = 'present';
          if (idx === 2 && i === 2) status = 'absent';
          else if (idx === 4 && i === 3) status = 'late';
          return { studentId: st._id, status, remarks: status === 'absent' ? 'Medical' : '' };
        });

        this.attendances.items.push({
          _id: `${prefix}att_${i}`,
          date: dStr,
          year: yyyy,
          month: parseInt(mm, 10),
          classId: classAId,
          subjectId: mathId,
          markedByName: 'Prof. Noorudheen',
          records,
          totalStudents: records.length,
          presentCount: records.filter(r => r.status === 'present').length,
          absentCount: records.filter(r => r.status === 'absent').length,
          lateCount: records.filter(r => r.status === 'late').length,
          createdAt: d,
          updatedAt: d
        });
      }
    }

    this.activities.items.push({
      _id: `${prefix}act_init`,
      action: 'SYSTEM_INIT',
      description: this.isDemo 
        ? 'Hajar App Demo Sandbox initialized with isolated sample school data'
        : 'Hajar App in-memory store initialized with default school data',
      user: { name: 'System', email: 'admin@hajar.edu', role: 'admin' },
      details: {},
      timestamp: new Date()
    });
  }
}

const memoryStore = new MemoryStore({ isDemo: false });
const demoMemoryStore = new MemoryStore({ isDemo: true });

/**
 * Creates a transparent Smart Model that delegates to MongoDB when connected (readyState === 1),
 * or instantly to MemoryStore when offline or unconfigured.
 * When in Demo Sandbox (storeContext isDemo === true), automatically routes to demoMemoryStore.
 */
function wrapModel(realMongooseModel, memoryCollection) {
  const colName = memoryCollection.name;
  return new Proxy(realMongooseModel, {
    construct(target, args) {
      const ctx = storeContext.getStore();
      if (ctx && ctx.isDemo) {
        const targetCol = demoMemoryStore[colName] || memoryCollection;
        return targetCol._wrapDoc(args[0] || {});
      }
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        return new target(...args);
      }
      return memoryCollection._wrapDoc(args[0] || {});
    },
    get(target, prop, receiver) {
      const ctx = storeContext.getStore();
      if (ctx && ctx.isDemo) {
        const targetCol = demoMemoryStore[colName] || memoryCollection;
        if (typeof targetCol[prop] === 'function') {
          return targetCol[prop].bind(targetCol);
        }
        return Reflect.get(target, prop, receiver);
      }
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        return Reflect.get(target, prop, receiver);
      }
      if (typeof memoryCollection[prop] === 'function') {
        return memoryCollection[prop].bind(memoryCollection);
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

module.exports = {
  memoryStore,
  demoMemoryStore,
  storeContext,
  wrapModel
};
