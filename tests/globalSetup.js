const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

module.exports = async () => {
  const envPath = path.join(process.cwd(), '.env.test');

  if (!fs.existsSync(envPath)) {
    console.warn('\n[test] .env.test skipping DB setup\n');
    return;
  }

  require('dotenv').config({ path: envPath });

  const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!adminUrl) {
    console.warn('\n[test] No database URL in .env.test\n');
    return;
  }

  const pool = new Pool({ connectionString: adminUrl });

  try {
    const schema = fs.readFileSync(
      path.join(__dirname, '../src/db/schema.sql'),
      'utf8'
    );
    await pool.query(schema);
    console.log('\n[test] schema applied\n');

    await grantTestPermissions(pool);
  } finally {
    await pool.end();
  }
};

async function grantTestPermissions(pool) {
  if (!process.env.DATABASE_URL) return;

  const appUrl = new URL(process.env.DATABASE_URL);
  const appUser = appUrl.username;
  const appPassword = decodeURIComponent(appUrl.password);
  const dbName = new URL(process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL).pathname.slice(1);
  
  const { rows } = await pool.query(
    'SELECT 1 FROM pg_roles WHERE rolname = $1',
    [appUser]
  );

  if (rows.length === 0) {
    const escaped = pool.escapeLiteral ? pool.escapeLiteral(appPassword) : `'${appPassword}'`;
    await pool.query(`CREATE ROLE "${appUser}" LOGIN PASSWORD ${escaped}`);
  }

  await pool.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${appUser}"`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO "${appUser}"`);
  await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${appUser}"`);
  await pool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${appUser}"`);
  await pool.query(`REVOKE UPDATE, DELETE ON audit_log FROM "${appUser}"`);
}
