const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();

const User = require('../models/user');
const { requireLogin } = require('../middleware/auth');

const avatarDir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarDir),
    // Extension comes from the verified mimetype, never from the user's filename.
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + TYPES[file.mimetype]),
  }),
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!TYPES[file.mimetype]) return cb(new Error('Only JPG, PNG, or WEBP images are allowed.'));
    cb(null, true);
  },
});

// Confirms the file's real content matches an image format (not just the claimed mimetype).
function looksLikeImage(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
    return jpg || png || webp;
  } catch (e) { return false; }
}

function removeAvatarFile(avatarPath) {
  if (!avatarPath) return;
  const full = path.join(__dirname, '..', 'public', avatarPath);
  if (full.startsWith(avatarDir + path.sep) && fs.existsSync(full)) {
    try { fs.unlinkSync(full); } catch (e) {}
  }
}

router.get('/profile', requireLogin, (req, res) => {
  res.render('profile', { title: 'My Profile', profile: User.findById(req.user.id) });
});

router.post('/profile/avatar', requireLogin, (req, res) => {
  upload.single('avatar')(req, res, (err) => {
    const file = req.file;
    const fail = (msg) => {
      if (file) fs.unlink(file.path, () => {});
      req.flash('error', msg);
      return res.redirect('/profile');
    };

    // Multipart bodies skip the global CSRF check, so it is verified here.
    if (!req.body || req.body._csrf !== req.session.csrf) return fail('Your form session expired. Please try again.');
    if (err) {
      return fail(err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large. Maximum size is 2 MB.' : err.message);
    }
    if (!file) return fail('Please choose an image to upload.');
    if (!looksLikeImage(file.path)) return fail('That file is not a valid image.');

    const old = User.findById(req.user.id).avatar_path;
    User.setAvatar(req.user.id, '/uploads/avatars/' + file.filename);
    removeAvatarFile(old);
    req.flash('success', 'Profile picture updated.');
    res.redirect('/profile');
  });
});

router.post('/profile/avatar/remove', requireLogin, (req, res) => {
  const old = User.findById(req.user.id).avatar_path;
  User.setAvatar(req.user.id, null);
  removeAvatarFile(old);
  req.flash('success', 'Profile picture removed.');
  res.redirect('/profile');
});

module.exports = router;