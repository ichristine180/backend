const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const svc = require("../services/documentService");

const uploadsDir = path.join(process.cwd(), "uploads", "documents");

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function uploadDocumentMiddleware(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      err.status = 400;
      err.message = "File size must not exceed 5MB";
      return next(err);
    }

    if (err instanceof multer.MulterError) {
      err.status = 400;
      return next(err);
    }

    return next(err);
  });
}

router.use(verifyToken);

router.get("/:id/download", async (req, res, next) => {
  try {
    const document = await svc.getDownloadableDocument(req.params.id, req.user);
    res.download(document.absolute_path, document.original_name);
  } catch (err) {
    next(err);
  }
});

module.exports = {
  router,
  uploadDocumentMiddleware,
};
