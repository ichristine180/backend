const pool = require("../db/pool");

async function listByApplicationId(applicationId) {
  const { rows } = await pool.query(
    `SELECT al.*,
            u.full_name  AS actor_name,
            u.email      AS actor_email
     FROM   audit_log al
     JOIN   users u ON u.id = al.actor_id
     WHERE  al.application_id = $1
     ORDER BY al.created_at ASC`,
    [applicationId],
  );
  return rows;
}

async function listAll() {
  const { rows } = await pool.query(
    `SELECT al.*,
            u.full_name        AS actor_name,
            u.email            AS actor_email,
            a.institution_name AS institution_name
     FROM   audit_log al
     JOIN   users u ON u.id = al.actor_id
     LEFT JOIN applications a ON a.id = al.application_id
     ORDER BY al.created_at DESC`,
  );
  return rows;
}

module.exports = {
  listByApplicationId,
  listAll,
};
