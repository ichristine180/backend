const pool = require("../db/pool");
async function getUserByEmail(emailAddr) {
  const res = await pool.query("SELECT * FROM users WHERE email = $1", [
    emailAddr,
  ]);
  return res.rows.length ? res.rows[0] : null;
}

async function findById(userId) {
  const sql =
    "SELECT id, email, full_name, role, organization, is_active, created_at FROM users WHERE id = $1";
  const { rows } = await pool.query(sql, [userId]);
  return rows[0] || null;
}

async function checkEmailExists(email) {
  const result = await pool.query("SELECT 1 FROM users WHERE email = $1", [
    email,
  ]);
  return result.rowCount > 0;
}

async function create(userData) {
  const { email, password_hash, full_name, role, organization } = userData;

  const queryText = `
    INSERT INTO users (email, password_hash, full_name, role, organization)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, email, full_name, role, organization, created_at`;

  const { rows } = await pool.query(queryText, [
    email,
    password_hash,
    full_name,
    role,
    organization || null,
  ]);

  return rows[0];
}

async function setActive(id, activeStatus) {
  const result = await pool.query(
    "UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, email, full_name, role, is_active",
    [activeStatus, id],
  );
  return result.rows[0] ?? null;
}

async function updateRole(userId, newRole) {
  const { rows } = await pool.query(
    "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, full_name, role",
    [newRole, userId],
  );
  return rows.length > 0 ? rows[0] : null;
}

async function listAll() {
  const query =
    "SELECT id, email, full_name, role, organization, is_active, created_at FROM users ORDER BY created_at DESC";
  const res = await pool.query(query);
  return res.rows;
}

module.exports = {
  getUserByEmail,
  findById,
  checkEmailExists,
  create,
  setActive,
  updateRole,
  listAll,
};
