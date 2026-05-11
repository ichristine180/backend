const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

async function initDb() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error(
      "DATABASE_ADMIN_URL is required to initialize the database",
    );
  }

  const adminPool = new Pool({ connectionString: adminUrl });
  const client = await adminPool.connect();

  try {
    await applySchema(client);
    await setupAppUser(client);
    ensureUploadsDir();
  } finally {
    client.release();
    await adminPool.end();
  }
}

async function applySchema(client) {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await client.query(sql);
  console.log("[db] schema ready");
}

async function setupAppUser(client) {
  const appUrl = new URL(process.env.DATABASE_URL);
  const appUser = appUrl.username;
  const appPassword = decodeURIComponent(appUrl.password);

  if (!appUser || !appPassword) {
    console.warn("[db] DATABASE_URL missing credentials");
    return;
  }

  const dbName = new URL(process.env.DATABASE_ADMIN_URL).pathname.slice(1);

  const { rows } = await client.query(
    "SELECT 1 FROM pg_roles WHERE rolname = $1",
    [appUser],
  );

  if (rows.length === 0) {
    const escapedPwd = client.escapeLiteral(appPassword);
    await client.query(`CREATE ROLE "${appUser}" LOGIN PASSWORD ${escapedPwd}`);
    console.log(`[db] role "${appUser}" created`);
  }

  await client.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${appUser}"`);
  await client.query(`GRANT USAGE ON SCHEMA public TO "${appUser}"`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${appUser}"`,
  );
  await client.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${appUser}"`,
  );

  // audit_log is append-only
  await client.query(`REVOKE UPDATE, DELETE ON audit_log FROM "${appUser}"`);

  console.log(`[db] permissions set]`);
}

function ensureUploadsDir() {
  const dir = path.join(process.cwd(), "uploads", "documents");
  fs.mkdirSync(dir, { recursive: true });
  console.log("[db] uploads directory ready");
}

module.exports = { initDb };
