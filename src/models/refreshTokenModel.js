const pool = require("../db/pool");

async function findWithUser(hash) {
  const sql = `
    SELECT rt.*, u.id as user_id_copy, u.email, u.role, u.full_name, u.is_active
    FROM refresh_tokens rt
    INNER JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = $1
  `;

  const res = await pool.query(sql, [hash]);
  if (!res.rows.length) return null;

  const data = res.rows[0];
  return {
    ...data,
    uid: data.user_id_copy,
  };
}

async function save(uid, hash, expiry) {
  const query =
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)";
  await pool.query(query, [uid, hash, expiry]);
}

async function remove(tokenHash) {
  const result = await pool.query(
    "DELETE FROM refresh_tokens WHERE token_hash = $1",
    [tokenHash],
  );
  return result.rowCount > 0;
}

async function removeAllForUser(userId) {
  await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
}

module.exports = {
  findWithUser,
  save,
  remove,
  removeAllForUser,
};
