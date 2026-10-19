const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const router = express.Router();

const Event = require('../models/event');
const { requireLogin } = require('../middleware/auth');
const { formatDate, eventStatus, venueLabel, venueColor, trimString, eligibilityLabel, eligibilityNames, checkEligibility, collegeName } = require('../utils/helpers');

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
const { BUILDINGS, CATEGORIES, CAMPUS_CENTER, MAIN_GATE, COLLEGES } = require('../config/constants');

router.get('/', (req, res) => {
  const q = trimString(req.query.q);
  const status = trimString(req.query.status);
  const events = Event.listPublic({ q, status });

  const enriched = events.map(e => ({
    ...e,
    live_status: eventStatus(e),
    venue_label: venueLabel(e.venue_key),
    venue_color: venueColor(e.venue_key),
    starts_fmt: formatDate(e.starts_at),
    ends_fmt: formatDate(e.ends_at),
    eligibility_label: eligibilityLabel(e),
    eligibility_list: eligibilityNames(e),
    restricted: !!e.eligible_colleges,
  }));

  res.render('index', {
    title: 'Browse Events',
    events: enriched,
    q, status,
    statuses: ['open', 'ongoing', 'completed', 'cancelled'],
    BUILDINGS, CATEGORIES, CAMPUS_CENTER, MAIN_GATE,
  });
});

router.get('/campus-map', (req, res) => {
  res.render('campus-map', {
    title: 'CSPC Campus Map',
    highlight: trimString(req.query.venue) || trimString(req.query.building) || null,
    BUILDINGS, CATEGORIES, CAMPUS_CENTER, MAIN_GATE,
  });
});

router.get('/events/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.redirect('/');

  const event = Event.findById(id);
  if (!event) return res.status(404).render('error', {
    title: 'Event not found', code: 404,
    message: 'That event does not exist or has been removed.',
  });

  const live = eventStatus(event);
  let myRegistration = null;
  if (req.user) myRegistration = Event.findRegistration(event.id, req.user.id);

  res.render('event-detail', {
    title: event.title,
    event: {
      ...event,
      live_status: live,
      venue_label: venueLabel(event.venue_key),
      venue_color: venueColor(event.venue_key),
      starts_fmt: formatDate(event.starts_at),
      ends_fmt: formatDate(event.ends_at),
      eligibility_label: eligibilityLabel(event),
      eligibility_list: eligibilityNames(event),
      restricted: !!event.eligible_colleges,
    },
    myRegistration,
    eligibility: req.user ? checkEligibility(event, req.user) : { ok: true },
    BUILDINGS, CATEGORIES, CAMPUS_CENTER, MAIN_GATE,
  });
});

// Everything that decides whether this user may register (used by BOTH the form page and the submit)
function registrationGate(req, event) {
  if (!event) return { ok: false, type: 'error', msg: 'Event not found.', to: '/' };
  const back = `/events/${event.id}`;
  if (req.user.role !== 'student') {
    return { ok: false, type: 'warning', msg: 'Only student accounts can register for events.', to: back };
  }
  if (Event.findRegistration(event.id, req.user.id)) {
    return { ok: false, type: 'warning', msg: 'You are already registered for this event.', to: '/my-registrations' };
  }
  const live = eventStatus(event);
  if (live === 'completed' || live === 'cancelled') {
    return { ok: false, type: 'error', msg: 'Registration is closed for this event.', to: back };
  }
  if (live === 'full') {
    return { ok: false, type: 'error', msg: 'This event is already full.', to: back };
  }
  const eligibility = checkEligibility(event, req.user);
  if (!eligibility.ok) return { ok: false, type: 'error', msg: eligibility.message, to: back };
  return { ok: true };
}

function renderRegisterForm(req, res, event, form, errors = []) {
  res.render('event-register', {
    title: `Register · ${event.title}`,
    event: {
      ...event,
      venue_label: venueLabel(event.venue_key),
      starts_fmt: formatDate(event.starts_at),
      ends_fmt: formatDate(event.ends_at),
      eligibility_label: eligibilityLabel(event),
      eligibility_list: eligibilityNames(event),
    },
    form,
    errors,
    yearLevels: YEAR_LEVELS,
  });
}

router.get('/events/:id/register', requireLogin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const event = Number.isFinite(id) ? Event.findById(id) : null;
  const gate = registrationGate(req, event);
  if (!gate.ok) { req.flash(gate.type, gate.msg); return res.redirect(gate.to); }

  // Pre-filled from the student's account; the student can fix name / year / section.
  renderRegisterForm(req, res, event, {
    name: req.user.name,
    department: req.user.department || collegeName(req.user.college) || '',
    program: req.user.program || '',
    year_level: req.user.year_level || '',
    section: String(req.user.section || '').toUpperCase(),
  });
});

router.post('/events/:id/register', requireLogin, (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const event = Number.isFinite(id) ? Event.findById(id) : null;
  const gate = registrationGate(req, event);
  if (!gate.ok) { req.flash(gate.type, gate.msg); return res.redirect(gate.to); }

  const name = trimString(req.body.name);
  const year_level = trimString(req.body.year_level);
  const section = trimString(req.body.section).toUpperCase();
  // Department and program are locked to the student's account so nobody can
  // pick another department to get around an event's restriction.
  const department = req.user.department || collegeName(req.user.college) || '';
  const program = req.user.program || '';

  const errors = [];
  if (name.length < 2 || name.length > 100) errors.push('Please enter your full name.');
  if (!YEAR_LEVELS.includes(year_level)) errors.push('Please select your year level.');
  if (!/^[A-Z0-9][A-Z0-9 -]{0,9}$/.test(section)) errors.push('Please enter your section (for example 2A).');
  if (!department) errors.push('Your account has no department. Please contact the administrator.');

  if (errors.length) {
    return renderRegisterForm(req, res, event, { name, department, program, year_level, section }, errors);
  }

  const token = crypto.randomBytes(16).toString('hex');
  Event.register(id, req.user.id, token, { name, department, program, year_level, section });

  const after = Event.findById(id);
  if (after.registered_count >= after.capacity && after.status === 'open') {
    Event.setStatus(id, 'full');
  }

  req.flash('success', 'You are registered! Your QR code is ready.');
  res.redirect('/my-registrations');
});

router.get('/my-registrations', requireLogin, (req, res) => {
  const regs = Event.myRegistrations(req.user.id).map(r => ({
    ...r,
    live_status: eventStatus(r),
    venue_label: venueLabel(r.venue_key),
    starts_fmt: formatDate(r.starts_at),
  }));
  res.render('my-registrations', { title: 'My Registrations', registrations: regs });
});

router.get('/qr/:token.png', (req, res, next) => {
  const token = req.params.token;
  const reg = Event.findRegistrationByToken(token);
  if (!reg) return res.status(404).send('Not found');

  const payload = JSON.stringify({ t: token, e: reg.event_id, u: reg.user_id });

  QRCode.toBuffer(payload, {
    errorCorrectionLevel: 'M', margin: 2, width: 400,
    color: { dark: '#0b3d91', light: '#ffffff' },
  }, (err, buf) => {
    if (err) return next(err);
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="cspc-qr-${token.slice(0, 8)}.png"`);
    res.send(buf);
  });
});

module.exports = router;