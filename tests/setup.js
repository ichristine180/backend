const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.test');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}
const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;

if (adminUrl) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: adminUrl });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE application_comments, audit_log, documents,
               refresh_tokens, applications, users
      RESTART IDENTITY CASCADE
    `);
  });
}
