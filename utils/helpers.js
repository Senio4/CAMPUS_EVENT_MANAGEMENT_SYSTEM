const { VENUES, BUILDINGS, COLLEGES } = require('../config/constants');

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateOnly(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function eventStatus(event, now = Date.now()) {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'completed') return 'completed';
  if (event.status === 'draft') return 'draft';
  const start = new Date(event.starts_at.replace(' ', 'T')).getTime();
  const end = new Date(event.ends_at.replace(' ', 'T')).getTime();
  if (now >= start && now <= end) return 'ongoing';
  if (now > end) return 'completed';
  if (event.registered_count >= event.capacity) return 'full';
  return 'open';
}

function venueLabel(key) {
  const v = VENUES.find(x => x.key === key);
  if (v) return v.label;
  const b = BUILDINGS.find(x => x.key === key);
  return b ? b.label : key;
}

function venueColor(key) {
  const b = BUILDINGS.find(x => x.key === key);
  if (b) return b.color;
  const fallback = { gym: '#dc2626', auditorium: '#f59e0b', library: '#0b3d91' };
  return fallback[key] || '#0b3d91';
}

function notFound(res) {
  return res.status(404).render('error', {
    title: 'Page not found', code: 404,
    message: 'The page you are looking for does not exist.',
  });
}

function trimString(v) { return (v == null ? '' : String(v)).trim(); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isStrongPassword(v) {
  return typeof v === 'string' && v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v);
}

// ---------------------------------------------------------------
// EVENT ELIGIBILITY (which colleges/departments may register)
// ---------------------------------------------------------------
function eligibleCodes(event) {
  return String((event && event.eligible_colleges) || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

function collegeName(code) {
  const c = COLLEGES.find(x => x.code === code);
  return c ? c.name : code;
}

// "Open to all students" or "College of Engineering and Architecture, College of Computer Studies"
function eligibilityNames(event) {
  const codes = eligibleCodes(event);
  return codes.length ? codes.map(collegeName) : ['All students'];
}

function eligibilityLabel(event) {
  const codes = eligibleCodes(event);
  return codes.length ? codes.map(collegeName).join(', ') : 'All students';
}

// Used by BOTH the event page (to hide the button) and POST /register (the real enforcement).
function checkEligibility(event, user) {
  const codes = eligibleCodes(event);
  if (!codes.length) return { ok: true };            // open to everyone
  if (user && user.role === 'admin') return { ok: true };
  if (user && user.college && codes.includes(user.college)) return { ok: true };
  return {
    ok: false,
    message: `This event is only open to students from: ${eligibilityLabel(event)}.`
      + (user && user.college ? ` Your college (${collegeName(user.college)}) is not included.` : ''),
  };
}

// ---------------------------------------------------------------
// ATTENDANCE GROUPING: Department -> Program -> Year -> Section
// rows = [{ department, college, program, year_level, section, present, ... }]
// returns [{ department, total, present, groups: [{ program, year_level, section, rows, total, present }] }]
// ---------------------------------------------------------------
function yearNumber(y) {
  const m = String(y || '').match(/\d+/);
  return m ? Number(m[0]) : 99;
}

// Same labels everywhere (page grouping, download filters) so they always match.
function rowLabels(r) {
  return {
    department: r.department || collegeName(r.college) || 'Unassigned Department',
    program: r.program || 'Unassigned Program',
    year_level: r.year_level || 'Unassigned Year',
    section: r.section || 'Unassigned Section',
  };
}

function groupAttendance(rows) {
  const deps = new Map();
  for (const r of rows) {
    const { department: dep, program: prog, year_level: yr, section: sec } = rowLabels(r);
    if (!deps.has(dep)) deps.set(dep, new Map());
    const groups = deps.get(dep);
    const key = `${prog}|${yr}|${sec}`;
    if (!groups.has(key)) groups.set(key, { program: prog, year_level: yr, section: sec, rows: [] });
    groups.get(key).rows.push(r);
  }

  return [...deps.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([department, groups]) => {
      const list = [...groups.values()]
        .sort((a, b) =>
          a.program.localeCompare(b.program) ||
          yearNumber(a.year_level) - yearNumber(b.year_level) ||
          a.section.localeCompare(b.section))
        .map(g => ({
          ...g,
          rows: g.rows.sort((a, b) => a.name.localeCompare(b.name)),
          total: g.rows.length,
          present: g.rows.filter(x => x.present).length,
        }));
      return {
        department,
        groups: list,
        total: list.reduce((s, g) => s + g.total, 0),
        present: list.reduce((s, g) => s + g.present, 0),
      };
    });
}

// ---------------------------------------------------------------
// TIME: present_at is saved in UTC by SQLite -> show Philippine time (UTC+8)
// ---------------------------------------------------------------
function phTime(utcStr) {
  if (!utcStr) return null;
  const d = new Date(String(utcStr).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return null;
  const tz = 'Asia/Manila';
  return {
    date: d.toLocaleDateString('en-PH', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-PH', { timeZone: tz, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
  };
}

function formatPresentAt(utcStr) {
  const t = phTime(utcStr);
  return t ? `${t.date}, ${t.time}` : '—';
}

// ---------------------------------------------------------------
// ATTENDANCE DOWNLOAD (CSV)
// ---------------------------------------------------------------
function slug(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Keep only the rows of the chosen program / year / section (used by the per-section download buttons)
function filterAttendance(rows, q = {}) {
  const program = trimString(q.program);
  const year = trimString(q.year);
  const section = trimString(q.section);
  return rows.filter(r => {
    const l = rowLabels(r);
    return (!program || l.program === program)
        && (!year || l.year_level === year)
        && (!section || l.section === section);
  });
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // stop spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
}

function attendanceCsv(rows) {
  const ordered = groupAttendance(rows).flatMap(d => d.groups.flatMap(g => g.rows));
  const header = ['No.', 'Name', 'Email', 'Department', 'Program', 'Year Level', 'Section', 'Status', 'Date Present', 'Time Present'];
  const lines = [header.map(csvCell).join(',')];
  ordered.forEach((r, i) => {
    const l = rowLabels(r);
    const t = phTime(r.present_at);
    lines.push([
      i + 1, r.name, r.email, l.department, l.program, l.year_level, l.section,
      r.present ? 'PRESENT' : 'ABSENT',
      t ? t.date : '', t ? t.time : '',
    ].map(csvCell).join(','));
  });
  return '\uFEFF' + lines.join('\r\n');           // BOM so Excel reads it correctly
}

function attendanceFilename(event, q = {}) {
  const parts = ['attendance', slug(event.title)];
  if (q.program) parts.push(slug(q.program));
  if (q.year) parts.push(slug(q.year));
  if (q.section) parts.push('section-' + slug(q.section));
  parts.push(new Date().toISOString().slice(0, 10));
  return parts.filter(Boolean).join('_') + '.csv';
}

module.exports = {
  phTime, formatPresentAt, slug, filterAttendance, attendanceCsv, attendanceFilename, rowLabels,
  eligibleCodes, collegeName, eligibilityNames, eligibilityLabel, checkEligibility, groupAttendance,
  formatDate, formatDateOnly, eventStatus, venueLabel, venueColor,
  notFound, trimString, isEmail, isStrongPassword,
  VENUES, BUILDINGS,
};