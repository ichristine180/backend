const pool = require("../db/pool");

async function insertDocumentVersion(db, input) {
  const vRes = await db.query(
      "SELECT MAX(version) as current_v FROM documents WHERE application_id = $1 AND document_type = $2",
      [input.application_id, input.document_type],
  );
  const lastVersion = vRes.rows[0].current_v || 0;
  const newVersion = Number(lastVersion) + 1;
  await db.query(
    "UPDATE documents SET is_current = false WHERE application_id = $1 AND document_type = $2 AND is_current = true",
    [input.application_id, input.document_type],
  );
  const sql = `
      INSERT INTO documents (
        application_id, uploaded_by, original_name, stored_name,
        file_path, file_size, mime_type, document_type, version, is_current
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      RETURNING *`;

  const result = await db.query(sql, [
    input.application_id,
    input.uploaded_by,
    input.original_name,
    input.stored_name,
    input.file_path,
    input.file_size,
    input.mime_type,
    input.document_type,
    newVersion,
  ]);

  return result.rows[0];
}

async function createDocumentVersion(input, db = null) {
  if (db) {
    return insertDocumentVersion(db, input);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const created = await insertDocumentVersion(client, input);
    await client.query("COMMIT");
    return created;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function listByApplicationId(appId) {
  const query =
    "SELECT * FROM documents WHERE application_id = $1 ORDER BY uploaded_at DESC, document_type ASC, version DESC";
  const res = await pool.query(query, [appId]);
  return res.rows;
}

async function listCurrentByApplicationId(appId) {
  const { rows } = await pool.query(
    "SELECT * FROM documents WHERE application_id = $1 AND is_current = true ORDER BY document_type ASC",
    [appId]
  );
  return rows;
}

async function findById(docId) {
  const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [
    docId,
  ]);
  return rows.length > 0 ? rows[0] : null;
}

module.exports = {
  createDocumentVersion,
  listByApplicationId,
  listCurrentByApplicationId,
  findById,
};
