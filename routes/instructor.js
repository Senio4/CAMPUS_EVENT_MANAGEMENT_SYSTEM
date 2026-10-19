const express = require('express');
const router = express.Router();

const Event = require('../models/event');
const User = require('../models/user');
const { requireRole } = require('../middleware/auth');
const { formatDate, eventStatus, venueLabel, groupAttendance, filterAttendance, attendanceCsv, attendanceFilename } = require('../utils/helpers');

router.use(requireRole('instructor'));

router.get('/', (req, res) => {
  const events = Event.eventsWithInstructorAttendance(req.user).map(e => ({
    ...e,
    live_status: eventStatus(e),
    venue_label: venueLabel(e.venue_key),
    starts_fmt: formatDate(e.starts_at),
  }));
  const myStudents = User.listStudentsByInstructor(req.user);
  const sectionCodes = User.parseSectionCodes(req.user.section);
  const totalSectionRegistrations = events.reduce((s, e) => s + e.section_registered_count, 0);
  const totalSectionPresent = events.reduce((s, e) => s + e.section_present_count, 0);

  res.render('instructor/dashboard', {
    title: 'Instructor Dashboard',
    events, sectionCodes,
    totalStudents: myStudents.length,
    totalSectionRegistrations, totalSectionPresent,
  });
});

router.get('/students', (req, res) => {
  const students = User.listStudentsByInstructor(req.user);
  const sectionCodes = User.parseSectionCodes(req.user.section);
  const grouped = {};
  for (const s of students) {
    const key = `${s.program || 'Unknown'} — ${s.section || 'Unknown'}`;
    grouped[key] ??= [];
    grouped[key].push(s);
  }
  res.render('instructor/students', { title: 'My Students', grouped, sectionCodes, totalStudents: students.length });
});

router.get('/students/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  // An instructor may only open students who belong to one of their own sections.
  const allowed = User.listStudentsByInstructor(req.user).some(s => s.id === id);
  const person = allowed ? User.findDetailById(id) : null;
  if (!person) {
    return res.status(404).render('error', { title: 'Student not found', code: 404, message: 'That student is not in your sections.' });
  }
  const registrations = Event.myRegistrations(id).map(r => ({
    ...r, starts_fmt: formatDate(r.starts_at), live_status: eventStatus({ status: r.event_status, starts_at: r.starts_at, ends_at: r.ends_at }),
  }));
  res.render('user-detail', { title: person.name, person, registrations, backHref: '/instructor/students', backLabel: 'My Students' });
});

router.get('/events/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const event = Event.findById(id);
  if (!event) return res.status(404).render('error', { title: 'Event not found', code: 404, message: 'That event does not exist.' });

  const rows = Event.attendanceByInstructor(id, req.user);
  res.render('instructor/event-attendance', {
    title: `Attendance · ${event.title}`,
    event: {
      ...event,
      live_status: eventStatus(event),
      venue_label: venueLabel(event.venue_key),
      starts_fmt: formatDate(event.starts_at),
      ends_fmt: formatDate(event.ends_at),
    },
    rows,
    departments: groupAttendance(rows),
    sectionCodes: User.parseSectionCodes(req.user.section),
  });
});

router.get('/events/:id/export.csv', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const event = Event.findById(id);
  if (!event) return res.status(404).send('Not found');

  // ?program=&year=&section= -> download only that one section (e.g. 2A)
  const rows = filterAttendance(Event.attendanceByInstructor(id, req.user), req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${attendanceFilename(event, req.query)}"`);
  res.send(attendanceCsv(rows));
});

module.exports = router;