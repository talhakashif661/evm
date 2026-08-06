import { jest } from '@jest/globals';

const loggerError = jest.fn();

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: { error: loggerError },
}));

const { errorHandler } = await import('../middleware/error.middleware.js');

const response = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('errorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a safe 503 for a MongoDB server-selection timeout', () => {
    const res = response();
    const error = new Error(
      'Raw query failed. Kind: Server selection timeout: No available servers.'
    );

    errorHandler(error, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Database is temporarily unavailable. Please try again shortly.',
    });
  });

  it('does not expose unexpected internal errors in development', () => {
    const res = response();

    errorHandler(new Error('sensitive implementation detail'), {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
    });
  });
});
