const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const request = require('supertest');
const app = require('../../src/app');

const envPath = path.join(process.cwd(), '.env.test');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}
const adminPool = new Pool({
  connectionString: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL
});

async function insertUser(email, password, role, fullName) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await adminPool.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, hash, fullName || `Test ${role}`, role]
  );
  return rows[0].id;
}

async function loginAs(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return {
    accessToken:  res.body.accessToken,
    refreshToken: res.body.refreshToken,
    user:         res.body.user
  };
}

async function createAndLogin(email, password, role, fullName) {
  await insertUser(email, password, role, fullName);
  return loginAs(email, password);
}

module.exports = { insertUser, loginAs, createAndLogin };
