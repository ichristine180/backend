function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
}

 
// the reviewer of an application cannot be the  person who approves or rejects it
function blockSelfApproval(req, res, next) {
  const application = req.application;
  if (!application) return next();

  if (application.reviewer_id === req.user.id) {
    return res.status(403).json({
      error: 'You cannot approve or reject an application  reviewed by you'
    });
  }

  next();
}

module.exports = { requireRole, blockSelfApproval };
