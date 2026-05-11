const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/roles");
const svc = require("../services/applicationService");
const auditService = require("../services/auditService");
const documentSvc = require("../services/documentService");
const { uploadDocumentMiddleware } = require("./documents");

router.use(verifyToken);
// Create a draft application
router.post("/", requireRole("APPLICANT"), async (req, res, next) => {
  try {
    const application = await svc.createApplication(req.user.id, req.body);
    res.status(201).json({ application });
  } catch (err) {
    next(err);
  }
});
router.get(
  "/",
  requireRole("APPLICANT", "REVIEWER", "APPROVER", "ADMIN"),
  async (req, res, next) => {
    try {
      const applications = await svc.listApplications(req.user);
      res.json({ applications });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:id",
  requireRole("APPLICANT", "REVIEWER", "APPROVER", "ADMIN"),
  async (req, res, next) => {
    try {
      const application = await svc.getApplication(req.params.id, req.user);
      res.json({ application });
    } catch (err) {
      next(err);
    }
  },
);

router.put("/:id", requireRole("APPLICANT"), async (req, res, next) => {
  try {
    const application = await svc.updateApplication(
      req.params.id,
      req.user.id,
      req.body,
    );
    res.json({ application });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:id/documents",
  requireRole("APPLICANT"),
  uploadDocumentMiddleware,
  async (req, res, next) => {
    try {
      const document = await documentSvc.uploadDocument(
        req.params.id,
        req.user,
        req.file,
        req.body?.document_type,
      );
      res.status(201).json({ document });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:id/documents",
  requireRole("APPLICANT", "REVIEWER", "APPROVER", "ADMIN"),
  async (req, res, next) => {
    try {
      const documents = await documentSvc.listDocuments(req.params.id, req.user);
      res.json({ documents });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:id/audit",
  requireRole("APPLICANT", "REVIEWER", "APPROVER", "ADMIN"),
  async (req, res, next) => {
    try {
      const auditLog = await auditService.listApplicationAudit(
        req.params.id,
        req.user,
      );
      res.json({ auditLog });
    } catch (err) {
      next(err);
    }
  },
);

router.post("/:id/submit", requireRole("APPLICANT"), async (req, res, next) => {
  try {
    const application = await svc.submit(req.params.id, req.user);
    res.json({ application });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:id/start-review",
  requireRole("REVIEWER"),
  async (req, res, next) => {
    try {
      const application = await svc.startReview(req.params.id, req.user);
      res.json({ application });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/request-info",
  requireRole("REVIEWER"),
  async (req, res, next) => {
    try {
      const application = await svc.requestInfo(
        req.params.id,
        req.user,
        req.body.reason,
      );
      res.json({ application });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/resubmit",
  requireRole("APPLICANT"),
  async (req, res, next) => {
    try {
      const application = await svc.resubmit(req.params.id, req.user);
      res.json({ application });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/complete-review",
  requireRole("REVIEWER"),
  async (req, res, next) => {
    try {
      const application = await svc.completeReview(
        req.params.id,
        req.user,
        req.body.review_notes,
      );
      res.json({ application });
    } catch (err) {
      next(err);
    }
  },
);

router.post("/:id/approve", requireRole("APPROVER"), async (req, res, next) => {
  try {
    const application = await svc.approve(req.params.id, req.user);
    res.json({ application });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reject", requireRole("APPROVER"), async (req, res, next) => {
  try {
    const application = await svc.reject(
      req.params.id,
      req.user,
      req.body?.reason,
    );
    res.json({ application });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
