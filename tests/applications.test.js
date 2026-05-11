const request = require('supertest');
const app = require('../src/app');
const { createAndLogin } = require('./helpers/users');

const PWD = 'Pass@1234';

let applicant, reviewer, approver;

beforeEach(async () => {
  [applicant, reviewer, approver] = await Promise.all([
    createAndLogin('applicant@test.com', PWD, 'APPLICANT'),
    createAndLogin('reviewer@test.com',  PWD, 'REVIEWER'),
    createAndLogin('approver@test.com',  PWD, 'APPROVER'),
  ]);
});

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function baseApp(overrides = {}) {
  return {
    institution_name: 'Test Bank Ltd',
    institution_type: 'Commercial Bank',
    license_type:     'Full Banking License',
    contact_email:    'info@testbank.rw',
    ...overrides
  };
}

async function createApp(token, overrides = {}) {
  return request(app)
    .post('/api/applications')
    .set(auth(token))
    .send(baseApp(overrides));
}
describe('POST /api/applications', () => {
  it('creates a DRAFT application for the logged-in applicant', async () => {
    const res = await createApp(applicant.accessToken);

    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe('DRAFT');
    expect(res.body.application.applicant_id).toBe(applicant.user.id);
  });

  it('does not expose reviewer_id or approver_id on a fresh application', async () => {
    const res = await createApp(applicant.accessToken);
    expect(res.body.application.reviewer_id).toBeNull();
    expect(res.body.application.approver_id).toBeNull();
  });

  it('returns 400 when institution_name is missing', async () => {
    const res = await request(app)
      .post('/api/applications')
      .set(auth(applicant.accessToken))
      .send({ institution_type: 'Commercial Bank', license_type: 'Full Banking License' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when license_type is missing', async () => {
    const res = await request(app)
      .post('/api/applications')
      .set(auth(applicant.accessToken))
      .send({ institution_name: 'Test Bank', institution_type: 'Commercial Bank' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when a reviewer tries to create an application', async () => {
    const res = await createApp(reviewer.accessToken);
    expect(res.status).toBe(403);
  });

  it('returns 403 when an approver tries to create an application', async () => {
    const res = await createApp(approver.accessToken);
    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).post('/api/applications').send(baseApp());
    expect(res.status).toBe(401);
  });
});

describe('GET /api/applications', () => {
  beforeEach(async () => {
    await Promise.all([
      createApp(applicant.accessToken),
      createApp(applicant.accessToken, { institution_name: 'Second Bank' }),
    ]);
  });

  it('applicant only sees their own applications', async () => {
    const res = await request(app)
      .get('/api/applications')
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.applications.length).toBe(2);
    res.body.applications.forEach(a => {
      expect(a.applicant_id).toBe(applicant.user.id);
    });
  });

  it('applicant does not see another applicants applications', async () => {
    const other = await createAndLogin('other@test.com', PWD, 'APPLICANT');
    await createApp(other.accessToken, { institution_name: 'Other Bank' });

    const res = await request(app)
      .get('/api/applications')
      .set(auth(applicant.accessToken));

    expect(res.body.applications.length).toBe(2);
  });

  it('reviewer sees no DRAFT applications', async () => {
    const res = await request(app)
      .get('/api/applications')
      .set(auth(reviewer.accessToken));

    expect(res.status).toBe(200);
    res.body.applications.forEach(a => {
      expect(a.status).not.toBe('DRAFT');
    });
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/applications');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/applications/:id', () => {
  let appId;

  beforeEach(async () => {
    const res = await createApp(applicant.accessToken);
    appId = res.body.application.id;
  });

  it('applicant can view their own application', async () => {
    const res = await request(app)
      .get(`/api/applications/${appId}`)
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.application.id).toBe(appId);
  });

  it('applicant cannot view another applicants application', async () => {
    const other = await createAndLogin('other2@test.com', PWD, 'APPLICANT');

    const res = await request(app)
      .get(`/api/applications/${appId}`)
      .set(auth(other.accessToken));

    expect(res.status).toBe(403);
  });

  it('reviewer cannot see a DRAFT application — 403 not 404', async () => {
    const res = await request(app)
      .get(`/api/applications/${appId}`)
      .set(auth(reviewer.accessToken));

    expect(res.status).toBe(403);
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await request(app)
      .get('/api/applications/00000000-0000-0000-0000-000000000000')
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(404);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app).get(`/api/applications/${appId}`);
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/applications/:id', () => {
  let appId;

  beforeEach(async () => {
    const res = await createApp(applicant.accessToken);
    appId = res.body.application.id;
  });

  it('applicant can update their DRAFT application', async () => {
    const res = await request(app)
      .put(`/api/applications/${appId}`)
      .set(auth(applicant.accessToken))
      .send({ institution_name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.application.institution_name).toBe('Updated Name');
  });

  it('partial update preserves fields that were not sent', async () => {
    const res = await request(app)
      .put(`/api/applications/${appId}`)
      .set(auth(applicant.accessToken))
      .send({ contact_email: 'new@bank.rw' });

    expect(res.status).toBe(200);
    expect(res.body.application.contact_email).toBe('new@bank.rw');
    expect(res.body.application.institution_name).toBe('Test Bank Ltd');
  });

  it('applicant cannot edit another applicants application', async () => {
    const other = await createAndLogin('other3@test.com', PWD, 'APPLICANT');

    const res = await request(app)
      .put(`/api/applications/${appId}`)
      .set(auth(other.accessToken))
      .send({ institution_name: 'Hijacked' });

    expect(res.status).toBe(403);
  });

  it('reviewer cannot edit any application', async () => {
    const res = await request(app)
      .put(`/api/applications/${appId}`)
      .set(auth(reviewer.accessToken))
      .send({ institution_name: 'Reviewer Edited' });

    expect(res.status).toBe(403);
  });

  it('approver cannot edit any application', async () => {
    const res = await request(app)
      .put(`/api/applications/${appId}`)
      .set(auth(approver.accessToken))
      .send({ institution_name: 'Approver Edited' });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no token', async () => {
    const res = await request(app)
      .put(`/api/applications/${appId}`)
      .send({ institution_name: 'No Token' });

    expect(res.status).toBe(401);
  });
});
