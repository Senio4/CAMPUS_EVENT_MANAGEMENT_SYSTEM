function requireLogin(req, res, next) {
  if (!req.user) {
    req.flash('warning', 'Please log in to continue.');
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      req.flash('warning', 'Please log in to continue.');
      return res.redirect('/login');
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('error', {
        title: 'Forbidden', code: 403,
        message: 'You do not have permission to access this page.',
      });
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };