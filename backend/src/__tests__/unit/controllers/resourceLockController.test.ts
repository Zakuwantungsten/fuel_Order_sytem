// Unit tests for the named "resource" lock controller (mutual exclusion over an
// operation rather than a document — e.g. one DO creation at a time).

const mockLockService = {
  acquireLock: jest.fn(),
  releaseLock: jest.fn(),
  getDisplayName: jest.fn(),
};

jest.mock('../../../services/lockService', () => mockLockService);

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { acquireResourceLock, releaseResourceLock } from '../../../controllers/resourceLockController';

function makeRes() {
  return { json: jest.fn() } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLockService.getDisplayName.mockResolvedValue('Alice A');
});

describe('acquireResourceLock', () => {
  it('acquires an allowlisted key and returns lockedUntil', async () => {
    mockLockService.acquireLock.mockResolvedValue({
      lockedBy: 'alice', lockedByName: 'Alice A', lockedUntil: new Date('2030-01-01'),
    });
    const req: any = { params: { key: 'do_create' }, user: { username: 'alice' } };
    const res = makeRes();

    await acquireResourceLock(req, res);

    expect(mockLockService.acquireLock).toHaveBeenCalledWith('resource_lock', 'do_create', 'alice', 'Alice A');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.any(Object) })
    );
  });

  it('accepts the lpo_create key', async () => {
    mockLockService.acquireLock.mockResolvedValue({
      lockedBy: 'alice', lockedByName: 'Alice A', lockedUntil: new Date('2030-01-01'),
    });
    const req: any = { params: { key: 'lpo_create' }, user: { username: 'alice' } };
    await acquireResourceLock(req, makeRes());
    expect(mockLockService.acquireLock).toHaveBeenCalledWith('resource_lock', 'lpo_create', 'alice', 'Alice A');
  });

  it('rejects an unknown key with 400 and never touches the lock store', async () => {
    const req: any = { params: { key: 'evil_key' }, user: { username: 'alice' } };
    await expect(acquireResourceLock(req, makeRes())).rejects.toMatchObject({ statusCode: 400 });
    expect(mockLockService.acquireLock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers with 401', async () => {
    const req: any = { params: { key: 'do_create' }, user: undefined };
    await expect(acquireResourceLock(req, makeRes())).rejects.toMatchObject({ statusCode: 401 });
    expect(mockLockService.acquireLock).not.toHaveBeenCalled();
  });

  it('propagates a 423 from the lock service when another user holds it', async () => {
    const err: any = new Error('locked');
    err.statusCode = 423;
    mockLockService.acquireLock.mockRejectedValue(err);
    const req: any = { params: { key: 'do_create' }, user: { username: 'bob' } };
    await expect(acquireResourceLock(req, makeRes())).rejects.toMatchObject({ statusCode: 423 });
  });
});

describe('releaseResourceLock', () => {
  it('releases an allowlisted key', async () => {
    mockLockService.releaseLock.mockResolvedValue(true);
    const req: any = { params: { key: 'do_create' }, user: { username: 'alice' } };
    const res = makeRes();

    await releaseResourceLock(req, res);
    expect(mockLockService.releaseLock).toHaveBeenCalledWith('resource_lock', 'do_create', 'alice');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects an unknown key with 400', async () => {
    const req: any = { params: { key: 'nope' }, user: { username: 'alice' } };
    await expect(releaseResourceLock(req, makeRes())).rejects.toMatchObject({ statusCode: 400 });
    expect(mockLockService.releaseLock).not.toHaveBeenCalled();
  });
});
