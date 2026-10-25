const db = require('../config/db');

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findByStudentId(studentId) {
  return db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId);
}

function findById(id) {
  return db.prepare(`
    SELECT id, name, email, role, college, program, department, year_level, section,
           organizer_position, organizer_office, avatar_path
    FROM users WHERE id = ?
  `).get(id);
}

function findDetailById(id) {
  return db.prepare(`
    SELECT id, name, email, role, college, program, department, year_level, section,
           organizer_position, organizer_office, avatar_path, created_at
    FROM users WHERE id = ?
  `).get(id);
}

function setAvatar(id, avatarPath) {
  return db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(avatarPath || null, id);
}

function create({
  name, last_name, student_id, email, password_hash, role,
  college, program, department, year_level, section,
  organizer_position, organizer_office,
}) {
  const info = db.prepare(`
    INSERT INTO users (
      name, last_name, student_id, email, password_hash, role,
      college, program, department, year_level, section,
      organizer_position, organizer_office
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, last_name || null, student_id || null, email, password_hash, role,
    college || null, program || null, department || null,
    year_level || null, section || null,
    organizer_position || null, organizer_office || null
  );
  return info.lastInsertRowid;
}

function listStudentsGrouped() {
  const rows = db.prepare(`
    SELECT id, name, email, college, program, department, year_level, section, avatar_path
    FROM users WHERE role = 'student'
    ORDER BY department, program, year_level, section, name
  `).all();

  const groups = {};
  for (const r of rows) {
    const dep = r.department || 'Unassigned Department';
    const prog = r.program || 'Unassigned Program';
    const yr = r.year_level || 'Unassigned Year';
    const sec = r.section || 'Unassigned Section';
    groups[dep] ??= {};
    groups[dep][prog] ??= {};
    groups[dep][prog][yr] ??= {};
    groups[dep][prog][yr][sec] ??= [];
    groups[dep][prog][yr][sec].push(r);
  }
  return groups;
}

function listAll() {
  return db.prepare(`
    SELECT id, name, email, role, college, program, department, year_level, section,
           organizer_position, organizer_office, avatar_path, created_at
    FROM users ORDER BY role, name
  `).all();
}

function updateRole(id, role) {
  return db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

function parseSectionCodes(str) {
  return String(str || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .map(code => {
      const dashIdx = code.indexOf('-');
      if (dashIdx === -1) return { program: '', section: code };
      return {
        program: code.slice(0, dashIdx).trim(),
        section: code.slice(dashIdx + 1).trim(),
      };
    });
}

function programShortToLong(shortCode) {
  const { COLLEGES } = require('../config/constants');
  for (const college of COLLEGES) {
    if (!college.shortCodes) continue;
    for (const [prog, short] of Object.entries(college.shortCodes)) {
      if (short.toUpperCase() === shortCode.toUpperCase()) return prog;
    }
  }
  return null;
}

function listStudentsByInstructor(instructor) {
  if (!instructor || instructor.role !== 'instructor') return [];
  const codes = parseSectionCodes(instructor.section);
  if (!codes.length) return [];

  const conditions = [];
  const params = [];

  for (const code of codes) {
    const longProgram = programShortToLong(code.program);
    if (!longProgram) continue;
    conditions.push('(program = ? AND section = ?)');
    params.push(longProgram, code.section);
  }

  if (!conditions.length) return [];

  return db.prepare(`
    SELECT id, name, email, college, program, department, year_level, section, avatar_path
    FROM users
    WHERE role = 'student'
      AND (${conditions.join(' OR ')})
    ORDER BY program, section, name
  `).all(...params);
}

function findInstructors() {
  return db.prepare(`
    SELECT id, name, email, college, program, department, section
    FROM users WHERE role = 'instructor' ORDER BY name
  `).all();
}

module.exports = {
  findByEmail, findByStudentId, findById, findDetailById, setAvatar, create,
  listStudentsGrouped, listAll, updateRole,
  parseSectionCodes, programShortToLong, listStudentsByInstructor, findInstructors,
};