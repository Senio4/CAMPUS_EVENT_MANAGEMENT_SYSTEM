const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();

const Event = require('../models/event');
const { requireRole } = require('../middleware/auth');
const { formatDate, eventStatus, venueLabel, venueColor, VENUES, trimString, groupAttendance, filterAttendance, attendanceCsv, attendanceFilename } = require('../utils/helpers');
const { COLLEGES } = require('../config/constants');

router.use(requireRole('organizer', 'admin'));
router.use((req, res, next) => { res.locals.COLLEGES = COLLEGES; next(); });

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed.'));
    }
    cb(null, true);
  },
});

function checkCsrf(req, res) {
  if (req.body._csrf !== req.session.csrf) {
    res.status(403).render('error', {
      title: 'Invalid request', code: 403,
      message: 'Your form session expired. Please refresh and try again.',
    });
    return false;
  }
  return true;
}

function deleteBanner(bannerPath) {
  if (!bannerPath) return;
  const full = path.join(__dirname, '..', bannerPath);
  if (full.startsWith(uploadDir) && fs.existsSync(full)) {
    try { fs.unlinkSync(full); } catch (e) {}
  }
}

router.get('/events', (req, res) => {
  const events = Event.listByOrganizer(req.user.id).map(e => ({
    ...e,
    live_status: eventStatus(e),
    venue_label: venueLabel(e.venue_key),
    venue_color: venueColor(e.venue_key),
    starts_fmt: formatDate(e.starts_at),
  }));
  res.render('organizer/dashboard', { title: 'Manage Events', events });
});

router.get('/events/new', (req, res) => {
  res.render('organizer/event-form', {
    title: 'Create Event', mode: 'create', venues: VENUES,
    event: { title: '', description: '', banner_path: null, venue_key: 'gym', venue_detail: '', starts_at: '', ends_at: '', capacity: 50, eligible_colleges: '', status: 'draft' },
  });
});

router.post('/events', upload.single('banner'), (req, res) => {
  if (!checkCsrf(req, res)) return;

  const data = readEventForm(req.body);
  data.banner_path = req.file ? '/uploads/' + req.file.filename : null;

  const errors = validateEvent(data);
  if (errors.length) {
    if (req.file) deleteBanner(data.banner_path);
    req.flash('error', errors.join(' '));
    return res.render('organizer/event-form', {
      title: 'Create Event', mode: 'create', venues: VENUES, event: data,
    });
  }

  delete data.audience;
  data.organizer_id = req.user.id;
  const id = Event.create(data);
  req.flash('success', 'Event created.');
  res.redirect(`/organizer/events/${id}`);
});

router.get('/events/:id', (req, res) => {
  const event = Event.findById(Number(req.params.id));
  if (!event || (event.organizer_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Event not found.' });
  }
  res.render('organizer/event-form', { title: 'Edit Event', mode: 'edit', venues: VENUES, event });
});

router.post('/events/:id', upload.single('banner'), (req, res) => {
  if (!checkCsrf(req, res)) return;

  const id = Number(req.params.id);
  const existing = Event.findById(id);
  if (!existing || (existing.organizer_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Event not found.' });
  }

  const data = readEventForm(req.body);

  if (req.body.remove_banner === '1') {
    deleteBanner(existing.banner_path);
    data.banner_path = null;
  } else if (req.file) {
    deleteBanner(existing.banner_path);
    data.banner_path = '/uploads/' + req.file.filename;
  } else {
    data.banner_path = existing.banner_path;
  }

  const errors = validateEvent(data);
  if (errors.length) {
    if (req.file) deleteBanner(data.banner_path);
    req.flash('error', errors.join(' '));
    return res.render('organizer/event-form', {
      title: 'Edit Event', mode: 'edit', venues: VENUES, event: { ...data, id },
    });
  }

  delete data.audience;
  Event.update(id, data);
  req.flash('success', 'Event updated.');
  res.redirect(`/organizer/events/${id}`);
});

['post', 'start', 'complete', 'cancel'].forEach(action => {
  router.post(`/events/:id/${action}`, (req, res) => {
    const id = Number(req.params.id);
    const existing = Event.findById(id);
    if (!existing || (existing.organizer_id !== req.user.id && req.user.role !== 'admin')) {
      return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Event not found.' });
    }
    const map = { post: 'open', start: 'ongoing', complete: 'completed', cancel: 'cancelled' };
    Event.setStatus(id, map[action]);
    req.flash('success', `Event marked ${map[action]}.`);
    res.redirect(`/organizer/events/${id}`);
  });
});

router.post('/events/:id/delete', (req, res) => {
  const id = Number(req.params.id);
  const existing = Event.findById(id);
  if (!existing || (existing.organizer_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Event not found.' });
  }
  deleteBanner(existing.banner_path);
  Event.remove(id);
  req.flash('success', 'Event deleted.');
  res.redirect('/organizer/events');
});

router.get('/events/:id/attendance', (req, res) => {
  const event = Event.findById(Number(req.params.id));
  if (!event || (event.organizer_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Event not found.' });
  }
  const participants = Event.participants(event.id);
  res.render('organizer/attendance', {
    title: `Attendance · ${event.title}`,
    event: { ...event, venue_label: venueLabel(event.venue_key), starts_fmt: formatDate(event.starts_at) },
    participants,
    departments: groupAttendance(participants),
  });
});

router.get('/events/:id/export.csv', (req, res) => {
  const event = Event.findById(Number(req.params.id));
  if (!event || (event.organizer_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Event not found.' });
  }
  const rows = filterAttendance(Event.participants(event.id), req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${attendanceFilename(event, req.query)}"`);
  res.send(attendanceCsv(rows));
});

router.post('/events/:id/scan', (req, res) => {
  const id = Number(req.params.id);
  const event = Event.findById(id);
  if (!event || (event.organizer_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).json({ ok: false, error: 'Event not found.' });
  }

  let token = trimString(req.body.token);
  if (token.startsWith('{')) {
    try { token = JSON.parse(token).t || token; } catch {}
  }

  const reg = Event.findRegistrationByToken(token);
  if (!reg) return res.json({ ok: false, error: 'Invalid QR code.' });
  if (reg.event_id !== id) return res.json({ ok: false, error: 'QR belongs to a different event.' });
  if (reg.present) return res.json({ ok: false, error: `${reg.user_name} is already marked present.` });

  Event.markPresent(reg.id);
  res.json({ ok: true, name: reg.user_name, message: `${reg.user_name} marked present.` });
});

router.post('/events/:id/present/:regId', (req, res) => {
  const id = Number(req.params.id);
  const regId = Number(req.params.regId);
  const event = Event.findById(id);
  if (!event || (event.organizer_id !== req.user.id && req.user.role !== 'admin')) {
    return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Event not found.' });
  }
  if (!Event.participants(id).some(p => p.reg_id === regId)) {
    return res.status(404).render('error', { title: 'Not found', code: 404, message: 'Registration not found for this event.' });
  }
  Event.markPresent(regId);
  req.flash('success', 'Marked present.');
  res.redirect(`/organizer/events/${id}/attendance`);
});

function readEventForm(body) {
  // audience = 'all' -> any student can register; 'specific' -> only the ticked colleges
  let codes = [].concat(body.eligible_colleges || []).map(trimString).filter(Boolean);
  codes = [...new Set(codes.filter(c => COLLEGES.some(x => x.code === c)))];
  const audience = trimString(body.audience) === 'specific' ? 'specific' : 'all';
  return {
    audience,
    eligible_colleges: audience === 'specific' ? codes.join(',') : '',
    title: trimString(body.title),
    description: trimString(body.description),
    venue_key: trimString(body.venue_key) || 'gym',
    venue_detail: trimString(body.venue_detail),
    starts_at: trimString(body.starts_at).replace('T', ' '),
    ends_at: trimString(body.ends_at).replace('T', ' '),
    capacity: Number.parseInt(body.capacity, 10) || 0,
    status: trimString(body.status) || 'draft',
  };
}

function validateEvent(d) {
  const errors = [];
  if (d.title.length < 3) errors.push('Title is too short.');
  if (d.description.length < 10) errors.push('Description is too short.');
  if (!VENUES.find(v => v.key === d.venue_key)) errors.push('Invalid venue.');
  if (!d.starts_at || !d.ends_at) errors.push('Start and end times are required.');
  if (new Date(d.ends_at) <= new Date(d.starts_at)) errors.push('End time must be after start time.');
  if (d.capacity < 1 || d.capacity > 5000) errors.push('Capacity must be between 1 and 5000.');
  if (d.audience === 'specific' && !d.eligible_colleges) errors.push('Select at least one department/college that can join, or choose "All students".');
  return errors;
}

module.exports = router;