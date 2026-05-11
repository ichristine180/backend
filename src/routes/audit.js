const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");
const auditService = require("../services/auditService");

router.use(verifyToken);

router.get("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const auditLog = await auditService.listSystemAudit();
    res.json({ auditLog });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
