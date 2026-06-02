import { checkRole } from '../middleware/auth.js';

describe('RBAC Middleware Unit Tests', () => {
  test('blocks request with no role header and returns 401', () => {
    const req = {
      headers: {} // No x-user-role
    };

    let statusCalledWith = null;
    let jsonCalledWith = null;
    const res = {
      status(code) {
        statusCalledWith = code;
        return this;
      },
      json(body) {
        jsonCalledWith = body;
        return this;
      }
    };

    const next = jest.fn();

    checkRole(['Compliance_Auditor'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusCalledWith).toBe(401);
    expect(jsonCalledWith.error).toContain('Missing user role header');
  });

  test('blocks request with wrong role and returns 403', () => {
    const req = {
      headers: {
        'x-user-role': 'Agent'
      }
    };

    let statusCalledWith = null;
    let jsonCalledWith = null;
    const res = {
      status(code) {
        statusCalledWith = code;
        return this;
      },
      json(body) {
        jsonCalledWith = body;
        return this;
      }
    };

    const next = jest.fn();

    checkRole(['Compliance_Auditor'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusCalledWith).toBe(403);
    expect(jsonCalledWith.error).toContain('is not authorized');
  });

  test('passes request with correct role', () => {
    const req = {
      headers: {
        'x-user-role': 'Compliance_Auditor'
      }
    };

    const res = {};
    const next = jest.fn();

    checkRole(['Compliance_Auditor'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
