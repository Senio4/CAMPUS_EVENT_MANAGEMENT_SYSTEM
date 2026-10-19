require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const dbFile = process.env.DB_PATH || './data/campus.db';
fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });

require('./config/db');
require('./config/seed')();
const db = require('./config/db');
const helpers = require('./utils/helpers');
const { BUILDINGS, CATEGORIES, CAMPUS_CENTER, MAIN_GATE } = require('./config/constants');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
}));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) console.warn('WARNING: SESSION_SECRET not set.');

app.use(session({
  name: 'campus.sid',
  secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 4,
  },
}));

Object.assign(app.locals, helpers);
app.locals.BUILDINGS = BUILDINGS;
app.locals.CATEGORIES = CATEGORIES;
app.locals.CAMPUS_CENTER = CAMPUS_CENTER;
app.locals.MAIN_GATE = MAIN_GATE;

app.use((req, res, next) => {
  req.flash = (type, msg) => { req.session.flash = { type, msg }; };
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  res.locals.title = 'Campus Events';
  res.locals.user = null;
  res.locals.theme = req.cookies?.theme === 'dark' ? 'dark' : 'light';
  res.locals.currentPath = req.path;
  res.locals.query = req.query || {};
  res.locals.year = new Date().getFullYear();

  if (req.session.userId) {
    const u = db.prepare(
      'SELECT id,name,email,role,college,program,department,year_level,section,organizer_position,organizer_office,avatar_path FROM users WHERE id = ?'
    ).get(req.session.userId);
    if (u) { req.user = u; res.locals.user = u; }
    else { delete req.session.userId; }
  }

  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;

  if (req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    const isMultipart = contentType.includes('multipart/form-data');
    if (!isMultipart) {
      const token = req.body._csrf || req.get('x-csrf-token');
      if (token !== req.session.csrf) {
        return res.status(403).render('error', {
          title: 'Invalid request', code: 403,
          message: 'Your form session expired. Please refresh and try again.',
        });
      }
    }
  }
  next();
});

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/profile'));
app.use('/', require('./routes/events'));
app.use('/organizer', require('./routes/organizer'));
app.use('/instructor', require('./routes/instructor'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => helpers.notFound(res));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('=== ERROR ===');
  console.error('Path:', req.method, req.path);
  console.error('Message:', err.message);
  console.error('Stack:', err.stack);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).render('error', {
    title: status === 404 ? 'Not found' : 'Server error',
    code: status,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong on our side.',
  });
});

const PORT = Number.parseInt(process.env.PORT || '3000', 10) || 3000;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`CSPC Campus Event Management System running at http://localhost:${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const next = port + 1;
      console.warn(`Port ${port} in use, trying ${next}...`);
      startServer(next);
      return;
    }
    throw err;
  });
}

startServer(PORT);