const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

function seed() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (row.c > 0) return;

  console.log('Seeding demo data...');

  const insertUser = db.prepare(`
    INSERT INTO users (
      name, email, password_hash, role,
      college, program, department, year_level, section,
      organizer_position, organizer_office
    )
    VALUES (
      @name, @email, @password_hash, @role,
      @college, @program, @department, @year_level, @section,
      @organizer_position, @organizer_office
    )
  `);

  const users = [
    { name: 'System Admin', email: 'admin@campus.test', pw: 'Admin123!',
      role: 'admin', college: null, program: null, department: null,
      year_level: null, section: null, organizer_position: null, organizer_office: null },

    { name: 'Event Organizer', email: 'organizer@campus.test', pw: 'Organizer123!',
      role: 'organizer', college: 'CCS', program: null,
      department: 'College of Computer Studies',
      year_level: null, section: null,
      organizer_position: 'Events Officer', organizer_office: 'SASO' },

    { name: 'Prof. Maria Reyes', email: 'instructor@campus.test', pw: 'Instructor123!',
      role: 'instructor', college: 'CCS', program: 'BS Information Technology',
      department: 'College of Computer Studies',
      year_level: null, section: 'BSIT-2A,BSIT-3A',
      organizer_position: null, organizer_office: null },

    { name: 'Prof. Carlos Mendoza', email: 'instructor2@campus.test', pw: 'Instructor123!',
      role: 'instructor', college: 'CCS', program: 'BS Computer Science',
      department: 'College of Computer Studies',
      year_level: null, section: 'BSCS-1A,BSCS-1B,BSCS-2A',
      organizer_position: null, organizer_office: null },

    { name: 'Prof. Anna Lim', email: 'instructor3@campus.test', pw: 'Instructor123!',
      role: 'instructor', college: 'CHS', program: 'BS Nursing',
      department: 'College of Health Sciences',
      year_level: null, section: 'BSN-3A,BSN-4A',
      organizer_position: null, organizer_office: null },

    { name: 'Juan Dela Cruz', email: 'student@campus.test', pw: 'Student123!',
      role: 'student', college: 'CCS', program: 'BS Information Technology',
      department: 'College of Computer Studies',
      year_level: '2nd Year', section: '2A',
      organizer_position: null, organizer_office: null },
    { name: 'Pedro Penduko', email: 'student3@campus.test', pw: 'Student123!',
      role: 'student', college: 'CCS', program: 'BS Information Technology',
      department: 'College of Computer Studies',
      year_level: '2nd Year', section: '2A',
      organizer_position: null, organizer_office: null },
    { name: 'Maria Santos', email: 'student2@campus.test', pw: 'Student123!',
      role: 'student', college: 'CCS', program: 'BS Information Technology',
      department: 'College of Computer Studies',
      year_level: '3rd Year', section: '3A',
      organizer_position: null, organizer_office: null },
    { name: 'Ana Lopez', email: 'student4@campus.test', pw: 'Student123!',
      role: 'student', college: 'CCS', program: 'BS Information Technology',
      department: 'College of Computer Studies',
      year_level: '3rd Year', section: '3A',
      organizer_position: null, organizer_office: null },

    { name: 'Jose Rizal', email: 'student5@campus.test', pw: 'Student123!',
      role: 'student', college: 'CCS', program: 'BS Computer Science',
      department: 'College of Computer Studies',
      year_level: '1st Year', section: '1A',
      organizer_position: null, organizer_office: null },
    { name: 'Andres Bonifacio', email: 'student6@campus.test', pw: 'Student123!',
      role: 'student', college: 'CCS', program: 'BS Computer Science',
      department: 'College of Computer Studies',
      year_level: '1st Year', section: '1B',
      organizer_position: null, organizer_office: null },
    { name: 'Gabriela Silang', email: 'student7@campus.test', pw: 'Student123!',
      role: 'student', college: 'CCS', program: 'BS Computer Science',
      department: 'College of Computer Studies',
      year_level: '2nd Year', section: '2A',
      organizer_position: null, organizer_office: null },

    { name: 'Emilio Aguinaldo', email: 'student8@campus.test', pw: 'Student123!',
      role: 'student', college: 'CCS', program: 'BS Information Systems',
      department: 'College of Computer Studies',
      year_level: '3rd Year', section: '3A',
      organizer_position: null, organizer_office: null },

    { name: 'Nurse Rizal', email: 'student9@campus.test', pw: 'Student123!',
      role: 'student', college: 'CHS', program: 'BS Nursing',
      department: 'College of Health Sciences',
      year_level: '3rd Year', section: '3A',
      organizer_position: null, organizer_office: null },
    { name: 'Nurse Sisa', email: 'student10@campus.test', pw: 'Student123!',
      role: 'student', college: 'CHS', program: 'BS Nursing',
      department: 'College of Health Sciences',
      year_level: '3rd Year', section: '3A',
      organizer_position: null, organizer_office: null },
    { name: 'Nurse Basilio', email: 'student11@campus.test', pw: 'Student123!',
      role: 'student', college: 'CHS', program: 'BS Nursing',
      department: 'College of Health Sciences',
      year_level: '4th Year', section: '4A',
      organizer_position: null, organizer_office: null },
  ];

  const ids = {};
  for (const u of users) {
    const hash = bcrypt.hashSync(u.pw, 10);
    const info = insertUser.run({
      name: u.name, email: u.email, password_hash: hash,
      role: u.role, college: u.college, program: u.program,
      department: u.department, year_level: u.year_level, section: u.section,
      organizer_position: u.organizer_position, organizer_office: u.organizer_office,
    });
    ids[u.email] = info.lastInsertRowid;
  }

  const insertEvent = db.prepare(`
    INSERT INTO events (title, description, banner_path, venue_key, venue_detail, starts_at, ends_at, capacity, status, organizer_id)
    VALUES (@title, @description, @banner_path, @venue_key, @venue_detail, @starts_at, @ends_at, @capacity, @status, @organizer_id)
  `);

  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

  const events = [
    { title: 'Orientation Day (Live Demo)', description: 'Welcome event for new students.',
      banner_path: null, venue_key: 'auditorium', venue_detail: 'Main entrance',
      starts_at: iso(now - 30 * 60 * 1000), ends_at: iso(now + 3 * 60 * 60 * 1000),
      capacity: 200, status: 'ongoing', organizer_id: ids['organizer@campus.test'] },
    { title: 'CCS Tech Summit 2026', description: 'A day of talks, workshops, and a hackathon.',
      banner_path: null, venue_key: 'ccs-building', venue_detail: 'Main hall',
      starts_at: iso(now + 2 * 24 * 60 * 60 * 1000), ends_at: iso(now + 2 * 24 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000),
      capacity: 150, status: 'open', organizer_id: ids['organizer@campus.test'] },
    { title: 'Nursing Skills Demo', description: 'Live demonstration of basic nursing skills.',
      banner_path: null, venue_key: 'acad-6', venue_detail: 'Skills Lab, 2nd floor',
      starts_at: iso(now + 3 * 24 * 60 * 60 * 1000), ends_at: iso(now + 3 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
      capacity: 60, status: 'open', organizer_id: ids['organizer@campus.test'] },
  ];

  const eventIds = [];
  for (const e of events) {
    const info = insertEvent.run(e);
    eventIds.push(info.lastInsertRowid);
  }

  const insertReg = db.prepare(`
    INSERT OR IGNORE INTO registrations (event_id, user_id, qr_token, present, present_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const registrations = [
    { email: 'student@campus.test',  eventIdx: 0, present: 1 },
    { email: 'student3@campus.test', eventIdx: 0, present: 1 },
    { email: 'student2@campus.test', eventIdx: 0, present: 1 },
    { email: 'student4@campus.test', eventIdx: 0, present: 0 },
    { email: 'student5@campus.test', eventIdx: 0, present: 1 },
    { email: 'student6@campus.test', eventIdx: 0, present: 0 },
    { email: 'student7@campus.test', eventIdx: 0, present: 1 },
    { email: 'student@campus.test',  eventIdx: 1, present: 0 },
    { email: 'student2@campus.test', eventIdx: 1, present: 0 },
    { email: 'student5@campus.test', eventIdx: 1, present: 0 },
    { email: 'student9@campus.test',  eventIdx: 2, present: 1 },
    { email: 'student10@campus.test', eventIdx: 2, present: 0 },
    { email: 'student11@campus.test', eventIdx: 2, present: 1 },
  ];

  for (const r of registrations) {
    insertReg.run(
      eventIds[r.eventIdx],
      ids[r.email],
      crypto.randomBytes(16).toString('hex'),
      r.present,
      r.present ? nowIso : null
    );
  }

  console.log('Seed complete. Demo logins:');
  console.log('  admin@campus.test        / Admin123!');
  console.log('  organizer@campus.test    / Organizer123!');
  console.log('  instructor@campus.test   / Instructor123!   (BSIT-2A, BSIT-3A)');
  console.log('  instructor2@campus.test  / Instructor123!   (BSCS-1A, BSCS-1B, BSCS-2A)');
  console.log('  instructor3@campus.test  / Instructor123!   (BSN-3A, BSN-4A)');
  console.log('  student@campus.test      / Student123!');
}

module.exports = seed;