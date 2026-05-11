const jwt = require('jsonwebtoken');
const { verifyToken } = require('../src/middleware/auth');
const { requireRole, blockSelfApproval } = require('../src/middleware/roles');

process.env.JWT_SECRET = 'test_secret';

// helpers to cut down on repetition
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('verifyToken middleware', () => {
  it('attaches the decoded payload to req.user and calls next', () => {
    const payload = { id: 'u1', email: 'a@b.com', role: 'APPLICANT' };
    const req = { headers: { authorization: `Bearer ${makeToken(payload)}` } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe('u1');
    expect(req.user.role).toBe('APPLICANT');
  });

  it('returns 401 when the Authorization header is missing', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is garbage', () => {
    const req = { headers: { authorization: 'Bearer not.valid.token' } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with a specific message when the token is expired', () => {
    const expired = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET, { expiresIn: -1 });
    const req = { headers: { authorization: `Bearer ${expired}` } };
    const res = mockRes();
    const next = jest.fn();

    verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Token expired' }));
  });
});

describe('requireRole middleware', () => {
  it('calls next when the user has the required role', () => {
    const req = { user: { role: 'REVIEWER' } };
    const next = jest.fn();

    requireRole('REVIEWER')(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  it('calls next when the user has one of multiple accepted roles', () => {
    const req = { user: { role: 'APPROVER' } };
    const next = jest.fn();

    requireRole('REVIEWER', 'APPROVER')(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when the role does not match — not 404, not 500', () => {
    const req = { user: { role: 'APPLICANT' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('REVIEWER')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is not set', () => {
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    requireRole('ADMIN')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks APPLICANT from accessing REVIEWER-only routes', () => {
    const req = { user: { role: 'APPLICANT' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('REVIEWER')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks REVIEWER from accessing APPROVER-only routes', () => {
    const req = { user: { role: 'REVIEWER' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('APPROVER')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks APPROVER from accessing ADMIN-only routes', () => {
    const req = { user: { role: 'APPROVER' } };
    const res = mockRes();
    const next = jest.fn();

    requireRole('ADMIN')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('blockSelfApproval middleware', () => {
  it('returns 403 when the approver is the same person who reviewed the application', () => {
    const userId = 'user-abc-123';
    const req = {
      user: { id: userId },
      application: { reviewer_id: userId }
    };
    const res = mockRes();
    const next = jest.fn();

    blockSelfApproval(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the approver is a different person from the reviewer', () => {
    const req = {
      user: { id: 'approver-id' },
      application: { reviewer_id: 'reviewer-id' }
    };
    const next = jest.fn();

    blockSelfApproval(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  it('calls next when no application is attached to req (guard check)', () => {
    const req = { user: { id: 'u1' } };
    const next = jest.fn();

    blockSelfApproval(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });
});

describe('uploadDocumentMiddleware', () => {
  it('returns a 400-style error when the uploaded file exceeds 5MB', () => {
    jest.resetModules();

    class MockMulterError extends Error {
      constructor(code) {
        super('File too large');
        this.code = code;
      }
    }

    const multerFactory = jest.fn(() => ({
      single: jest.fn(() => (req, res, cb) => cb(new MockMulterError('LIMIT_FILE_SIZE')))
    }));
    multerFactory.diskStorage = jest.fn(() => ({}));
    multerFactory.MulterError = MockMulterError;

    jest.doMock('multer', () => multerFactory);

    let uploadDocumentMiddleware;
    jest.isolateModules(() => {
      ({ uploadDocumentMiddleware } = require('../src/routes/documents'));
    });

    const next = jest.fn();
    uploadDocumentMiddleware({}, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        message: 'File size must not exceed 5MB'
      })
    );

    jest.dontMock('multer');
  });
});
