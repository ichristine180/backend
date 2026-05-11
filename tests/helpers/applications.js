const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const envPath = path.join(process.cwd(), ".env.test");
if (fs.existsSync(envPath)) require("dotenv").config({ path: envPath });

const pool = new Pool({
  connectionString: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL,
});

async function insertApplication(applicantId, status, extra = {}) {
  const { rows } = await pool.query(
    `INSERT INTO applications
       (applicant_id, institution_name, institution_type, license_type, status,
        reviewer_id, review_notes, submitted_at, decided_at, decision_reason, approver_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      applicantId,
      extra.institution_name ?? "Test Bank Ltd",
      extra.institution_type ?? "Commercial Bank",
      extra.license_type ?? "Full Banking License",
      status,
      extra.reviewer_id ?? null,
      extra.review_notes ?? null,
      extra.submitted_at ?? (status !== "DRAFT" ? new Date() : null),
      extra.decided_at ?? null,
      extra.decision_reason ?? null,
      extra.approver_id ?? null,
    ],
  );
  return rows[0];
}

async function insertDocument(applicationId, uploadedBy) {
  const stored = `${crypto.randomUUID()}.pdf`;
  await pool.query(
    `INSERT INTO documents
       (application_id, uploaded_by, original_name, stored_name, file_path, file_size, mime_type, document_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      applicationId,
      uploadedBy,
      "test.pdf",
      stored,
      `/uploads/documents/${stored}`,
      1024,
      "application/pdf",
      "REGISTRATION",
    ],
  );
}

module.exports = { insertApplication, insertDocument };
