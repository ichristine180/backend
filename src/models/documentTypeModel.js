const pool = require('../db/pool');

async function findAll() {
  const { rows } = await pool.query(
    'SELECT * FROM document_types ORDER BY mandatory DESC, name ASC'
  );
  return rows;
}

async function findByName(name) {
  const { rows } = await pool.query(
    'SELECT * FROM document_types WHERE name = $1',
    [name]
  );
  return rows[0] || null;
}

module.exports = { findAll, findByName };
