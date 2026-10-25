const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();

const User = require('../models/user');
const { COLLEGES } = require('../config/constants');
const { trimString, isEmail, isStrongPassword, isStudentId } = require('../utils/helpers');

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Login', email: '' });
});

router.post('/login', (req, res) => {
  const email = trimString(req.body.email).toLowerCase();
  const password = req.body.password || '';
  const chosenRole = trimString(req.body.role);

  if (!email) {
    req.flash('error', 'Please enter your email and password.');
    return res.redirect('/login');
  }

  const user = User.findByEmail(email);
  const ok = user
    && bcrypt.compareSync(password, user.password_hash)
    && user.role === chosenRole;
  if (!ok) {
    req.flash('error', 'Invalid email or password for the selected role.');
    return res.redirect('/login');
  }

  req.session.regenerate((err) => {
    if (err) {
      req.flash('error', 'Login failed. Please try again.');
      return res.redirect('/login');
    }
    req.session.userId = user.id;
    req.session.csrf = crypto.randomBytes(24).toString('hex');
    req.flash('success', `Welcome back, ${user.name.split(' ')[0]}!`);

    if (user.role === 'admin')       return res.redirect('/admin');
    if (user.role === 'instructor')  return res.redirect('/instructor');
    if (user.role === 'organizer')   return res.redirect('/organizer/events');
    return res.redirect('/');
  });
});

router.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('register', { title: 'Register', form: { role: 'student' }, colleges: COLLEGES });
});

router.post('/register', (req, res) => {
  const first_name = trimString(req.body.first_name);
  const last_name  = trimString(req.body.last_name);
  const name       = [first_name, last_name].filter(Boolean).join(' ');
  const student_id = trimString(req.body.student_id).toUpperCase();
  const email      = trimString(req.body.email).toLowerCase();
  const password   = req.body.password || '';
  const confirm    = req.body.confirm || '';
  const role       = 'student'; // never read from the request
  const college    = trimString(req.body.college);
  const program    = trimString(req.body.program);
  const year_level = trimString(req.body.year_level);
  const section    = trimString(req.body.section);

  const collegeObj = COLLEGES.find(c => c.code === college);
  const department = collegeObj ? collegeObj.name : college;

  const errors = [];
  if (!first_name || first_name.length > 60) errors.push('Please enter your first name.');
  if (!last_name  || last_name.length  > 60) errors.push('Please enter your last name.');
  if (!isEmail(email))             errors.push('Please enter a valid email address.');
  if (!isStrongPassword(password)) errors.push('Password must be at least 8 characters and include a letter and a number.');
  if (password !== confirm)        errors.push('Passwords do not match.');
  if (User.findByEmail(email))     errors.push('That email is already registered.');

  if (!isStudentId(student_id)) errors.push('Please enter a valid student ID number (4-20 letters, numbers or hyphens).');
  else if (User.findByStudentId(student_id)) errors.push('That student ID is already registered.');
  if (!college)    errors.push('Please select a college.');
  if (!program)    errors.push('Please select a program.');
  if (!year_level) errors.push('Please enter your year level.');
  if (!section)    errors.push('Please enter your section.');

  if (errors.length) {
    req.flash('error', errors.join(' '));
    return res.render('register', {
      title: 'Register',
      form: { first_name, last_name, student_id, email, role, college, program, year_level, section },
      colleges: COLLEGES,
    });
  }

  const hash = bcrypt.hashSync(password, 10);
  User.create({
    name, last_name, email, password_hash: hash, role,
    student_id,
    college: college || null,
    program: program || null,
    department: department || null,
    year_level: year_level || null,
    section: section || null,
  });

  req.flash('success', 'Account created successfully! Please log in with your email and password.');
  res.redirect('/login');
});

router.post('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

module.exports = router;