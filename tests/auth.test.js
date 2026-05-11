const request = require('supertest');
const app = require('../src/app');

const applicant = {
  email: 'paul@example.com',
  password: 'Secure@Pass1',
  full_name: 'Paul Barera',
  role: 'APPLICANT',
  organization: 'RTN'
};

async function registerApplicant(overrides = {}) {
  return request(app)
    .post('/api/auth/register')
    .send({ ...applicant, ...overrides });
}

async function login(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res;
}
describe('POST /api/auth/register', () => {
  it('creates an applicant account', async () => {
    const res = await registerApplicant();

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(applicant.email);
    expect(res.body.user.role).toBe('APPLICANT');
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('returns 409 when email is already taken', async () => {
    await registerApplicant();
    const res = await registerApplicant();

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'incomplete@example.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for a weak password', async () => {
    const res = await registerApplicant({ password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('returns 400 for an unrecognised role', async () => {
    const res = await registerApplicant({ role: 'SUPERUSER' });
    expect(res.status).toBe(400);
  });

  it('returns 403 when trying to self-register as REVIEWER', async () => {
    const res = await registerApplicant({ email: 'r@bnr.rw', role: 'REVIEWER' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when trying to self-register as APPROVER', async () => {
    const res = await registerApplicant({ email: 'a@bnr.rw', role: 'APPROVER' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when trying to self-register as ADMIN', async () => {
    const res = await registerApplicant({ email: 'admin@test.com', role: 'ADMIN' });
    expect(res.status).toBe(403);
  });
});


describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerApplicant();
  });

  it('returns accessToken, refreshToken and user on valid credentials', async () => {
    const res = await login(applicant.email, applicant.password);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe(applicant.email);
  });

  it('never exposes password_hash in the login response', async () => {
    const res = await login(applicant.email, applicant.password);
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('returns 401 for a wrong password', async () => {
    const res = await login(applicant.email, 'WrongPassword!');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 for an email that does not exist', async () => {
    const res = await login('nobody@example.com', applicant.password);
    expect(res.status).toBe(401);
  });

  it('returns 400 when email or password is not provided', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: applicant.email });

    expect(res.status).toBe(400);
  });
});



describe('POST /api/auth/refresh', () => {
  let refreshToken;

  beforeEach(async () => {
    await registerApplicant();
    const res = await login(applicant.email, applicant.password);
    refreshToken = res.body.refreshToken;
  });

  it('issues a new access token and rotates the refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('invalidates the old refresh token after rotation', async () => {
    await request(app).post('/api/auth/refresh').send({ refreshToken });

    // using the same token a second time should fail
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });

  it('returns 401 for a token that was never issued', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'completely_made_up_token' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when refreshToken is missing from body', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  let refreshToken;

  beforeEach(async () => {
    await registerApplicant();
    const res = await login(applicant.email, applicant.password);
    refreshToken = res.body.refreshToken;
  });

  it('logs out successfully', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });

    expect(res.status).toBe(200);
  });

  it('revokes the refresh token so it cannot be used again', async () => {
    await request(app).post('/api/auth/logout').send({ refreshToken });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });
});

