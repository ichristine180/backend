const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const svc = require('../services/documentTypeService');

router.use(verifyToken);

router.get('/', requireRole('APPLICANT', 'REVIEWER', 'APPROVER', 'ADMIN'), async (req, res, next) => {
  try {
    const documentTypes = await svc.listDocumentTypes();
    res.json({ documentTypes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
