const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const userModel = require('../models/userModel');
const refreshTokenModel = require('../models/refreshTokenModel');

const SALT_ROUNDS = 12;
const REFRESH_TTL_DAYS = 7;

async function register(userData) {
  const { email, password, full_name, role, organization } = userData;

  if (await userModel.checkEmailExists(email)) {
    const e = new Error('Email already registered');
    e.status = 409;
    throw e;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS); 

  return userModel.create({
    email,
    password_hash: passwordHash,
    full_name,
    role,
    organization,
  });
}

async function login({ email, password }) {
  const user = await userModel.getUserByEmail(email);
  if (!user || !user.is_active) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const accessToken = makeAccessToken(user);
  const { raw, hash, expiresAt } = makeRefreshToken();

  await refreshTokenModel.save(user.id, hash, expiresAt);

  return {
    accessToken,
    refreshToken: raw,
    user: pick(user, ['id', 'email', 'full_name', 'role'])
  };
}

async function refresh(rawToken) {
  const hash = hashToken(rawToken);
  const record = await refreshTokenModel.findWithUser(hash);
  if (!record) {
    const err = new Error('Invalid refresh token');
    err.status = 401;
    throw err;
  }

  if (!record.is_active) {
    const err = new Error('Account is disabled');
    err.status = 403;
    throw err;
  }

  if (new Date(record.expires_at) < new Date()) {
    await refreshTokenModel.remove(hash);
    const err = new Error('Refresh token expired, please log in again');
    err.status = 401;
    throw err;
  }

  // delete the old token and issue a fresh pair
  await refreshTokenModel.remove(hash);

  const newAccess = makeAccessToken({
    id: record.uid,
    email: record.email,
    role: record.role
  });
  const newRefresh = makeRefreshToken();

  await refreshTokenModel.save(record.uid, newRefresh.hash, newRefresh.expiresAt);

  return { accessToken: newAccess, refreshToken: newRefresh.raw };
}

async function logout(rawToken) {
  const hash = hashToken(rawToken);
  await refreshTokenModel.remove(hash);
}

function makeAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
}

function makeRefreshToken() {
  const raw = crypto.randomBytes(40).toString('hex');
  const hash = hashToken(raw);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);
  return { raw, hash, expiresAt };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function pick(obj, keys) {
  return keys.reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {});
}

module.exports = { register, login, refresh, logout };
