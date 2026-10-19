const express = require('express');
const router = express.Router();

const Event = require('../models/event');
const User = require('../models/user');
const { requireRole } = require('../middleware/auth');
const { eventStatus, formatDate, venueLabel, VENUES } = require('../utils/helpers');

router.use(requireRole('admin'));

router.get('/', (req, res) => {
  const stats = Event.stats();
  const events = Event.listPublic({}).map(e => ({
    ...e,
    live_status: eventStatus(e),
    venue_label: venueLabel(e.venue_key),
    starts_fmt: formatDate(e.starts_at),
  }));
  const users = User.listAll();
  const grouped = User.listStudentsGrouped();
  res.render('admin/dashboard', { title: 'Admin Dashboard', stats, events, users, grouped, venues: VENUES });
});

router.get('/users', (req, res) => {
  const users = User.listAll();
  const grouped = User.listStudentsGrouped();
  res.render('admin/users', { title: 'Users', users, grouped });
});

router.get('/users/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const person = Number.isInteger(id) ? User.findDetailById(id) : null;
  if (!person) {
    return res.status(404).render('error', { title: 'User not found', code: 404, message: 'That user does not exist.' });
  }
  const registrations = Event.myRegistrations(id).map(r => ({
    ...r, starts_fmt: formatDate(r.starts_at), live_status: eventStatus({ status: r.event_status, starts_at: r.starts_at, ends_at: r.ends_at }),
  }));
  res.render('user-detail', { title: person.name, person, registrations, backHref: '/admin/users', backLabel: 'Users' });
});

router.post('/users/:id/role', (req, res) => {
  const id = Number(req.params.id);
  const role = String(req.body.role || '');
  if (!['student', 'organizer', 'instructor', 'admin'].includes(role)) {
    req.flash('error', 'Invalid role.');
    return res.redirect('/admin/users');
  }
  if (id === req.user.id) {
    req.flash('error', 'You cannot change your own role.');
    return res.redirect('/admin/users');
  }
  User.updateRole(id, role);
  req.flash('success', 'Role updated.');
  res.redirect('/admin/users');
});

module.exports = router;