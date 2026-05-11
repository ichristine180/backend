const request = require('supertest');
const app = require('../src/app');
const { createAndLogin } = require('./helpers/users');
const { insertApplication, insertDocument } = require('./helpers/applications');

const PWD = 'Pass@1234';

let applicant, reviewer, reviewer2, approver;

beforeEach(async () => {
  [applicant, reviewer, reviewer2, approver] = await Promise.all([
    createAndLogin('app@test.com',  PWD, 'APPLICANT'),
    createAndLogin('rev@test.com',  PWD, 'REVIEWER'),
    createAndLogin('rev2@test.com', PWD, 'REVIEWER'),
    createAndLogin('apv@test.com',  PWD, 'APPROVER'),
  ]);
});

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

// ─── submit (DRAFT → SUBMITTED) ──────────────────────────────────────────────

describe('POST /:id/submit', () => {
  it('transitions DRAFT to SUBMITTED when a document exists', async () => {
    const app_ = await insertApplication(applicant.user.id, 'DRAFT');
    await insertDocument(app_.id, applicant.user.id);

    const res = await request(app)
      .post(`/api/applications/${app_.id}/submit`)
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('SUBMITTED');
    expect(res.body.application.submitted_at).not.toBeNull();
  });

  it('returns 400 when no documents have been uploaded', async () => {
    const app_ = await insertApplication(applicant.user.id, 'DRAFT');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/submit`)
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(400);
  });

  it('returns 403 when a different applicant tries to submit', async () => {
    const other = await createAndLogin('other@test.com', PWD, 'APPLICANT');
    const app_  = await insertApplication(applicant.user.id, 'DRAFT');
    await insertDocument(app_.id, applicant.user.id);

    const res = await request(app)
      .post(`/api/applications/${app_.id}/submit`)
      .set(auth(other.accessToken));

    expect(res.status).toBe(403);
  });

  it('returns 403 when a reviewer tries to submit', async () => {
    const app_ = await insertApplication(applicant.user.id, 'DRAFT');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/submit`)
      .set(auth(reviewer.accessToken));

    expect(res.status).toBe(403);
  });

  it('returns 400 when the application is already SUBMITTED', async () => {
    const app_ = await insertApplication(applicant.user.id, 'SUBMITTED');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/submit`)
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(400);
  });
});

// ─── start-review (SUBMITTED → UNDER_REVIEW) ─────────────────────────────────

describe('POST /:id/start-review', () => {
  it('transitions SUBMITTED to UNDER_REVIEW and sets reviewer_id', async () => {
    const app_ = await insertApplication(applicant.user.id, 'SUBMITTED');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/start-review`)
      .set(auth(reviewer.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('UNDER_REVIEW');
    expect(res.body.application.reviewer_id).toBe(reviewer.user.id);
  });

  it('returns 400 when the application is not SUBMITTED', async () => {
    const app_ = await insertApplication(applicant.user.id, 'DRAFT');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/start-review`)
      .set(auth(reviewer.accessToken));

    expect(res.status).toBe(400);
  });

  it('returns 403 when an applicant tries to start the review', async () => {
    const app_ = await insertApplication(applicant.user.id, 'SUBMITTED');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/start-review`)
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(403);
  });

  it('concurrent claim: exactly one reviewer succeeds when two race to claim the same application', async () => {
    const app_ = await insertApplication(applicant.user.id, 'SUBMITTED');

    const [res1, res2] = await Promise.all([
      request(app).post(`/api/applications/${app_.id}/start-review`).set(auth(reviewer.accessToken)),
      request(app).post(`/api/applications/${app_.id}/start-review`).set(auth(reviewer2.accessToken)),
    ]);

    const codes = [res1.status, res2.status].sort();
    expect(codes).toEqual([200, 400]);

    // whichever succeeded must have set a reviewer_id
    const winner = res1.status === 200 ? res1 : res2;
    expect(winner.body.application.reviewer_id).not.toBeNull();
  });
});

// ─── request-info (UNDER_REVIEW → ADDITIONAL_INFO_REQUIRED) ──────────────────

describe('POST /:id/request-info', () => {
  it('transitions to ADDITIONAL_INFO_REQUIRED when the assigned reviewer provides a reason', async () => {
    const app_ = await insertApplication(applicant.user.id, 'UNDER_REVIEW', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/request-info`)
      .set(auth(reviewer.accessToken))
      .send({ reason: 'Missing certificate of incorporation' });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('ADDITIONAL_INFO_REQUIRED');
  });

  it('returns 400 when no reason is given', async () => {
    const app_ = await insertApplication(applicant.user.id, 'UNDER_REVIEW', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/request-info`)
      .set(auth(reviewer.accessToken))
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 403 when a different reviewer tries to request info', async () => {
    const app_ = await insertApplication(applicant.user.id, 'UNDER_REVIEW', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/request-info`)
      .set(auth(reviewer2.accessToken))
      .send({ reason: 'Some reason' });

    expect(res.status).toBe(403);
  });
});

// ─── resubmit (ADDITIONAL_INFO_REQUIRED → UNDER_REVIEW) ──────────────────────

describe('POST /:id/resubmit', () => {
  it('transitions back to UNDER_REVIEW after the applicant uploads documents', async () => {
    const app_ = await insertApplication(applicant.user.id, 'ADDITIONAL_INFO_REQUIRED', { reviewer_id: reviewer.user.id });
    await insertDocument(app_.id, applicant.user.id);

    const res = await request(app)
      .post(`/api/applications/${app_.id}/resubmit`)
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('UNDER_REVIEW');
  });

  it('returns 400 when no documents have been uploaded', async () => {
    const app_ = await insertApplication(applicant.user.id, 'ADDITIONAL_INFO_REQUIRED', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/resubmit`)
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(400);
  });

  it('returns 403 when a reviewer tries to resubmit', async () => {
    const app_ = await insertApplication(applicant.user.id, 'ADDITIONAL_INFO_REQUIRED', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/resubmit`)
      .set(auth(reviewer.accessToken));

    expect(res.status).toBe(403);
  });
});

// ─── complete-review (UNDER_REVIEW → REVIEWED) ───────────────────────────────

describe('POST /:id/complete-review', () => {
  it('transitions to REVIEWED when the assigned reviewer submits notes', async () => {
    const app_ = await insertApplication(applicant.user.id, 'UNDER_REVIEW', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/complete-review`)
      .set(auth(reviewer.accessToken))
      .send({ review_notes: 'All documents verified. Financials look sound.' });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('REVIEWED');
    expect(res.body.application.review_notes).toBeTruthy();
  });

  it('returns 400 when review_notes are missing', async () => {
    const app_ = await insertApplication(applicant.user.id, 'UNDER_REVIEW', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/complete-review`)
      .set(auth(reviewer.accessToken))
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 403 when a different reviewer tries to complete the review', async () => {
    const app_ = await insertApplication(applicant.user.id, 'UNDER_REVIEW', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/complete-review`)
      .set(auth(reviewer2.accessToken))
      .send({ review_notes: 'Looks fine to me' });

    expect(res.status).toBe(403);
  });
});

// ─── approve (REVIEWED → APPROVED) ───────────────────────────────────────────

describe('POST /:id/approve', () => {
  it('approver can approve a REVIEWED application', async () => {
    const app_ = await insertApplication(applicant.user.id, 'REVIEWED', {
      reviewer_id: reviewer.user.id,
      review_notes: 'All clear'
    });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/approve`)
      .set(auth(approver.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('APPROVED');
    expect(res.body.application.approver_id).toBe(approver.user.id);
    expect(res.body.application.decided_at).not.toBeNull();
  });

  it('returns 403 when the reviewer tries to approve their own application', async () => {
    const app_ = await insertApplication(applicant.user.id, 'REVIEWED', {
      reviewer_id: approver.user.id,
      review_notes: 'I reviewed this'
    });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/approve`)
      .set(auth(approver.accessToken));

    expect(res.status).toBe(403);
  });

  it('returns 403 when an applicant tries to approve', async () => {
    const app_ = await insertApplication(applicant.user.id, 'REVIEWED', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/approve`)
      .set(auth(applicant.accessToken));

    expect(res.status).toBe(403);
  });

  it('returns 400 when application is not REVIEWED', async () => {
    const app_ = await insertApplication(applicant.user.id, 'SUBMITTED');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/approve`)
      .set(auth(approver.accessToken));

    expect(res.status).toBe(400);
  });
});

// ─── reject (REVIEWED → REJECTED) ────────────────────────────────────────────

describe('POST /:id/reject', () => {
  it('approver can reject a REVIEWED application with a reason', async () => {
    const app_ = await insertApplication(applicant.user.id, 'REVIEWED', {
      reviewer_id: reviewer.user.id,
      review_notes: 'Concerns noted'
    });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/reject`)
      .set(auth(approver.accessToken))
      .send({ reason: 'Insufficient capital base' });

    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('REJECTED');
    expect(res.body.application.decision_reason).toBe('Insufficient capital base');
  });

  it('returns 400 when no reason is provided', async () => {
    const app_ = await insertApplication(applicant.user.id, 'REVIEWED', { reviewer_id: reviewer.user.id });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/reject`)
      .set(auth(approver.accessToken))
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 403 when the reviewer tries to reject their own application', async () => {
    const app_ = await insertApplication(applicant.user.id, 'REVIEWED', {
      reviewer_id: approver.user.id
    });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/reject`)
      .set(auth(approver.accessToken))
      .send({ reason: 'Self-rejection attempt' });

    expect(res.status).toBe(403);
  });
});

// ─── invalid transitions ──────────────────────────────────────────────────────

describe('Invalid transitions', () => {
  it('cannot approve a DRAFT application — skipping the process entirely', async () => {
    const app_ = await insertApplication(applicant.user.id, 'DRAFT');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/approve`)
      .set(auth(approver.accessToken));

    expect(res.status).toBe(400);
  });

  it('cannot approve a SUBMITTED application — no review happened', async () => {
    const app_ = await insertApplication(applicant.user.id, 'SUBMITTED');

    const res = await request(app)
      .post(`/api/applications/${app_.id}/approve`)
      .set(auth(approver.accessToken));

    expect(res.status).toBe(400);
  });

  it('APPROVED is a terminal state — cannot reject after approval', async () => {
    const app_ = await insertApplication(applicant.user.id, 'APPROVED', {
      reviewer_id: reviewer.user.id,
      approver_id: approver.user.id
    });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/reject`)
      .set(auth(approver.accessToken))
      .send({ reason: 'Changed my mind' });

    expect(res.status).toBe(400);
  });

  it('REJECTED is a terminal state — cannot approve after rejection', async () => {
    const app_ = await insertApplication(applicant.user.id, 'REJECTED', {
      reviewer_id: reviewer.user.id,
      approver_id: approver.user.id,
      decision_reason: 'Original reason'
    });

    const res = await request(app)
      .post(`/api/applications/${app_.id}/approve`)
      .set(auth(approver.accessToken));

    expect(res.status).toBe(400);
  });
});
