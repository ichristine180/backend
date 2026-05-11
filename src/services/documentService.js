const fs = require("fs/promises");
const path = require("path");
const applicationModel = require("../models/applicationModel");
const documentModel = require("../models/documentModel");
const documentTypeModel = require("../models/documentTypeModel");

function err(status, message) {
  return Object.assign(new Error(message), { status });
}

async function getAccessibleApplication(applicationId, user) {
  const application = await applicationModel.findApplicationById(applicationId);

  if (!application) {
    throw err(404, "Application not found");
  }

  if (user.role === "APPLICANT" && application.applicant_id !== user.id) {
    throw err(403, "Access denied");
  }

  if (user.role === "REVIEWER" && application.status === "DRAFT") {
    throw err(403, "Access denied");
  }

  return application;
}

function resolveStoredFilePath(filePath) {
  // Paths are stored as /uploads/documents/... (web-style with leading slash).
  // Strip the leading slash so we can join correctly with cwd.
  const relativePath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return path.join(process.cwd(), relativePath);
}

async function removeUploadedFile(file) {
  if (!file?.path) return;

  try {
    await fs.unlink(file.path);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function uploadDocument(applicationId, user, file, documentType) {
  const application = await getAccessibleApplication(applicationId, user);

  if (user.role !== "APPLICANT") {
    await removeUploadedFile(file);
    throw err(403, "Access denied");
  }

  if (!["DRAFT", "ADDITIONAL_INFO_REQUIRED"].includes(application.status)) {
    await removeUploadedFile(file);
    throw err(
      400,
      "Documents can only be uploaded while the application is DRAFT or ADDITIONAL_INFO_REQUIRED",
    );
  }

  if (!file) {
    throw err(400, "A file is required");
  }

  if (typeof documentType !== "string" || documentType.trim() === "") {
    await removeUploadedFile(file);
    throw err(400, "document_type is required");
  }

  const knownType = await documentTypeModel.findByName(documentType.trim());
  if (!knownType) {
    await removeUploadedFile(file);
    throw err(400, `Unknown document type "${documentType}". Use GET /api/document-types to see valid types.`);
  }

  try {
    return await applicationModel.withTransaction(async (client) => {
      const created = await documentModel.createDocumentVersion({
        application_id: applicationId,
        uploaded_by: user.id,
        original_name: file.originalname,
        stored_name: file.filename,
        file_path: `/uploads/documents/${file.filename}`,
        file_size: file.size,
        mime_type: file.mimetype,
        document_type: documentType.trim(),
      }, client);

      await applicationModel.recordApplicationAudit(client, {
        applicationId: applicationId,
        actor: user,
        action: "DOCUMENT_UPLOADED",
        prevStatus: application.status,
        newStatus: application.status,
        prevState: application,
        newState: application,
        metadata: {
          document_id: created.id,
          document_type: created.document_type,
          version: created.version,
          original_name: created.original_name,
        },
      });

      return created;
    });
  } catch (error) {
    await removeUploadedFile(file);
    throw error;
  }
}

async function listDocuments(applicationId, user) {
  await getAccessibleApplication(applicationId, user);
  return documentModel.listByApplicationId(applicationId);
}

async function getDownloadableDocument(documentId, user) {
  const document = await documentModel.findById(documentId);

  if (!document) {
    throw err(404, "Document not found");
  }

  await getAccessibleApplication(document.application_id, user);

  const absolutePath = resolveStoredFilePath(document.file_path);

  try {
    await fs.access(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw err(404, "Stored file not found");
    }
    throw error;
  }

  return {
    ...document,
    absolute_path: absolutePath,
  };
}

module.exports = {
  uploadDocument,
  listDocuments,
  getDownloadableDocument,
};
