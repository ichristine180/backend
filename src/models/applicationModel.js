const pool = require("../db/pool");

async function createApplication(data, db = pool) {
  const query = `INSERT INTO applications (
    applicant_id, institution_name, institution_type, license_type, 
    registration_number, contact_email, contact_phone
  ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;

  const values = [
    data.applicant_id,
    data.institution_name,
    data.institution_type,
    data.license_type,
    data.registration_number ?? null,
    data.contact_email ?? null,
    data.contact_phone ?? null,
  ];

  const res = await db.query(query, values);
  return res.rows[0];
}

async function findApplicationById(id) {
  const { rows } = await pool.query(
    "SELECT * FROM applications WHERE id = $1",
    [id],
  );
  return rows[0] || null;
}
async function getApplicationForApplicant(userId) {
  const res = await pool.query(
    "SELECT * FROM applications WHERE applicant_id = $1 ORDER BY created_at DESC",
    [userId],
  );
  return res.rows;
}

async function getSubmittedApplications() {
  const res = await pool.query(
    "SELECT * FROM applications WHERE status != 'DRAFT' ORDER BY created_at DESC",
  );
  return res.rows;
}

async function getApplicationsForApprover() {
  const sql =
    "SELECT * FROM applications WHERE status IN ('REVIEWED','APPROVED','REJECTED') ORDER BY created_at DESC";
  const { rows } = await pool.query(sql);
  return rows;
}

async function listAll() {
  const result = await pool.query(
    "SELECT * FROM applications ORDER BY created_at DESC",
  );
  return result.rows;
}

async function updateApplication(id, body, db = pool) {
  const { rows } = await db.query(
    `UPDATE applications SET 
      institution_name = $1, institution_type = $2, license_type = $3,
      registration_number = $4, contact_email = $5, contact_phone = $6
     WHERE id = $7 AND status = 'DRAFT' RETURNING *`,
    [
      body.institution_name,
      body.institution_type,
      body.license_type,
      body.registration_number,
      body.contact_email,
      body.contact_phone,
      id,
    ],
  );
  return rows[0] ? rows[0] : null;
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function withApplicationLock(id, callback) {
  return withTransaction(async (client) => {
    const check = await client.query(
      "SELECT * FROM applications WHERE id = $1 FOR UPDATE",
      [id],
    );

    if (check.rowCount === 0) {
      throw new Error("Application not found");
    }

    return callback(client, check.rows[0]);
  });
}

async function applyApplicationUpdate(db, id, updateFields) {
  const allowedFields = [
    "status",
    "reviewer_id",
    "approver_id",
    "review_notes",
    "decision_reason",
    "submitted_at",
    "decided_at",
  ];
  const cols = Object.keys(updateFields).filter((key) => allowedFields.includes(key));

  if (cols.length === 0) {
    const { rows } = await db.query(
      "SELECT * FROM applications WHERE id = $1",
      [id],
    );
    return rows[0] || null;
  }

  const setParts = cols.map((key, i) => `${key} = $${i + 2}`);
  const values = cols.map((key) => updateFields[key]);

  const sql = `UPDATE applications SET ${setParts.join(", ")} WHERE id = $1 RETURNING *`;
  const result = await db.query(sql, [id, ...values]);
  return result.rows[0];
}

async function recordApplicationAudit(client, data) {
  const { actor, applicationId, action } = data;
  await client.query(
    `INSERT INTO audit_log (application_id, actor_id, actor_role, action, previous_status, new_status, previous_state, new_state, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      applicationId,
      actor.id,
      actor.role,
      action,
      data.prevStatus,
      data.newStatus,
      data.prevState,
      data.newState,
      data.metadata || null,
    ],
  );
}

async function countCurrentDocuments(appId, client) {
  const db = client || pool;
  const res = await db.query(
    "SELECT COUNT(*) FROM documents WHERE application_id = $1 AND is_current = true",
    [appId],
  );
  return Number(res.rows[0].count);
}

module.exports = {
  createApplication,
  findApplicationById,
  getApplicationForApplicant,
  getSubmittedApplications,
  getApplicationsForApprover,
  listAll,
  updateApplication,
  withTransaction,
  withApplicationLock,
  applyApplicationUpdate,
  recordApplicationAudit,
  countCurrentDocuments,
};
