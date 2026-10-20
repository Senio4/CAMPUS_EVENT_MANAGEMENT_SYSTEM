const db = require('../config/db');

// What the student typed on the registration form wins; old registrations fall back to the profile.
const REG_FIELDS = `
  COALESCE(r.reg_name, u.name)                                   AS name,
  u.email, u.college, u.avatar_path,
  COALESCE(r.reg_department, u.department)                       AS department,
  COALESCE(r.reg_program, u.program)                             AS program,
  COALESCE(r.reg_year_level, u.year_level)                       AS year_level,
  UPPER(TRIM(COALESCE(r.reg_section, u.section)))                AS section
`;

function baseSelect() {
  return `
    SELECT
      e.*,
      u.name AS organizer_name,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS registered_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.present = 1) AS present_count
    FROM events e
    JOIN users u ON u.id = e.organizer_id
  `;
}

function listPublic({ q = '', status = '' } = {}) {
  const where = [];
  const params = {};
  if (q) {
    where.push('(e.title LIKE @q OR e.description LIKE @q OR e.venue_key LIKE @q)');
    params.q = `%${q}%`;
  }
  if (status) {
    where.push('e.status = @status');
    params.status = status;
  }
  const sql = baseSelect()
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY datetime(e.starts_at) ASC';
  return db.prepare(sql).all(params);
}

function findById(id) {
  return db.prepare(baseSelect() + ' WHERE e.id = ?').get(id);
}

function listByOrganizer(organizerId) {
  return db.prepare(baseSelect() + ' WHERE e.organizer_id = ? ORDER BY datetime(e.starts_at) DESC').all(organizerId);
}

function create(data) {
  const info = db.prepare(`
    INSERT INTO events (title, description, banner_path, venue_key, venue_detail, starts_at, ends_at, capacity, eligible_colleges, status, organizer_id)
    VALUES (@title, @description, @banner_path, @venue_key, @venue_detail, @starts_at, @ends_at, @capacity, @eligible_colleges, @status, @organizer_id)
  `).run({ ...data, banner_path: data.banner_path || null, eligible_colleges: data.eligible_colleges || null });
  return info.lastInsertRowid;
}

function update(id, data) {
  return db.prepare(`
    UPDATE events SET
      title = @title, description = @description, banner_path = @banner_path,
      venue_key = @venue_key, venue_detail = @venue_detail,
      starts_at = @starts_at, ends_at = @ends_at,
      capacity = @capacity, eligible_colleges = @eligible_colleges, status = @status
    WHERE id = @id
  `).run({ id, ...data, banner_path: data.banner_path || null, eligible_colleges: data.eligible_colleges || null });
}

function setStatus(id, status) {
  return db.prepare('UPDATE events SET status = ? WHERE id = ?').run(status, id);
}

function remove(id) {
  return db.prepare('DELETE FROM events WHERE id = ?').run(id);
}

function participants(eventId) {
  return db.prepare(`
    SELECT r.id AS reg_id, r.qr_token, r.present, r.present_at, r.created_at AS registered_at,
           u.id AS user_id, ${REG_FIELDS}
    FROM registrations r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id = ?
    ORDER BY department, program, year_level, section, name
  `).all(eventId);
}

function register(eventId, userId, qrToken, info = {}) {
  const res = db.prepare(`
    INSERT INTO registrations (event_id, user_id, qr_token, reg_name, reg_department, reg_program, reg_year_level, reg_section)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId, userId, qrToken,
    info.name || null, info.department || null, info.program || null,
    info.year_level || null, info.section || null
  );
  return res.lastInsertRowid;
}

function findRegistration(eventId, userId) {
  return db.prepare('SELECT * FROM registrations WHERE event_id = ? AND user_id = ?').get(eventId, userId);
}

function findRegistrationByToken(token) {
  return db.prepare(`
    SELECT r.*, e.title AS event_title, u.name AS user_name
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    JOIN users u ON u.id = r.user_id
    WHERE r.qr_token = ?
  `).get(token);
}

function markPresent(regId) {
  return db.prepare(`
    UPDATE registrations SET present = 1, present_at = datetime('now')
    WHERE id = ? AND present = 0
  `).run(regId);
}

function myRegistrations(userId) {
  return db.prepare(`
    SELECT r.id, r.qr_token, r.present, r.present_at, r.created_at AS registered_at,
           e.id AS event_id, e.title AS event_title, e.starts_at, e.ends_at,
           e.venue_key, e.venue_detail, e.status AS event_status,
           e.banner_path,
           r.reg_name, r.reg_program, r.reg_year_level, r.reg_section
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    WHERE r.user_id = ?
    ORDER BY datetime(e.starts_at) DESC
  `).all(userId);
}

function stats() {
  const totalEvents   = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  const totalUsers    = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const totalStudents = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'student'").get().c;
  const totalRegs     = db.prepare('SELECT COUNT(*) AS c FROM registrations').get().c;
  const totalPresent  = db.prepare('SELECT COUNT(*) AS c FROM registrations WHERE present = 1').get().c;
  const byStatus = db.prepare('SELECT status, COUNT(*) AS c FROM events GROUP BY status').all();
  return { totalEvents, totalUsers, totalStudents, totalRegs, totalPresent, byStatus };
}

// SQL condition: registrations whose program + section belong to this instructor
function instructorCondition(instructor) {
  const User = require('./user');
  if (!instructor || instructor.role !== 'instructor') return null;
  const parts = [];
  const params = [];
  for (const code of User.parseSectionCodes(instructor.section)) {
    const longProgram = User.programShortToLong(code.program);
    if (!longProgram) continue;
    parts.push("(COALESCE(r.reg_program, u.program) = ? AND UPPER(TRIM(COALESCE(r.reg_section, u.section))) = ?)");
    params.push(longProgram, code.section);
  }
  return parts.length ? { sql: '(' + parts.join(' OR ') + ')', params } : null;
}

function attendanceByInstructor(eventId, instructor) {
  const cond = instructorCondition(instructor);
  if (!cond) return [];
  return db.prepare(`
    SELECT r.id AS reg_id, r.present, r.present_at, r.created_at AS registered_at,
           u.id AS user_id, ${REG_FIELDS}
    FROM registrations r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id = ? AND ${cond.sql}
    ORDER BY department, program, year_level, section, name
  `).all(eventId, ...cond.params);
}

function eventsWithInstructorAttendance(instructor) {
  const cond = instructorCondition(instructor);
  if (!cond) return [];
  const mine = `SELECT 1 FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = e.id AND ${cond.sql}`;
  const count = (extra) => `(SELECT COUNT(*) FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = e.id ${extra} AND ${cond.sql})`;
  return db.prepare(`
    SELECT e.*, ou.name AS organizer_name,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS registered_count,
      (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.present = 1) AS present_count,
      ${count('')} AS section_registered_count,
      ${count('AND r.present = 1')} AS section_present_count
    FROM events e
    JOIN users ou ON ou.id = e.organizer_id
    WHERE EXISTS (${mine})
    ORDER BY datetime(e.starts_at) DESC
  `).all(...cond.params, ...cond.params, ...cond.params);
}

module.exports = {
  listPublic, findById, listByOrganizer,
  create, update, setStatus, remove,
  participants, register, findRegistration, findRegistrationByToken,
  markPresent, myRegistrations, stats,
  attendanceByInstructor, eventsWithInstructorAttendance,
};