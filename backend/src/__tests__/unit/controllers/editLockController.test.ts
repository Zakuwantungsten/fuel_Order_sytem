// Unit tests for the edit-lock controller after locks were moved OFF the domain
// document into the dedicated `EditLock` collection.
//
// Locks must never write to the guarded document (so they don't broadcast and
// force other clients to refetch). These tests verify acquire/release/enforce
// behaviour against a mocked EditLock model — no database required.

const mockEditLock = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
};

const mockUser = { findOne: jest.fn() };

jest.mock('../../../models', () => ({
  EditLock: mockEditLock,
  User: mockUser,
}));

jest.mock('../../../services/websocket', () => ({
  emitLockChange: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { createEditLockHandlers, enforceEditLock } from '../../../controllers/editLockController';

// Minimal mongoose-model stub: only the calls the controller makes.
function makeDomainModel(exists: boolean) {
  return {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(exists ? { _id: 'doc1' } : null),
      }),
    }),
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(exists ? { _id: 'doc1' } : null),
      }),
    }),
  } as any;
}

function makeRes() {
  return { json: jest.fn() } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  // User display-name lookup → return a friendly name
  mockUser.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ firstName: 'Alice', lastName: 'A' }),
    }),
  });
});

describe('acquireEditLock', () => {
  it('upserts a lock and never touches the domain document', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOneAndUpdate.mockResolvedValue({ lockedUntil: new Date('2030-01-01') });
    const { acquireEditLock } = createEditLockHandlers(model, 'lpo_summaries');

    const req: any = { params: { id: 'doc1' }, user: { username: 'alice' } };
    const res = makeRes();
    await acquireEditLock(req, res);

    expect(mockEditLock.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = mockEditLock.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ collectionName: 'lpo_summaries', documentId: 'doc1' });
    expect(update).toMatchObject({ lockedBy: 'alice' });
    expect(opts).toMatchObject({ upsert: true });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.any(Object) })
    );
    // The domain model must NOT be updated by a lock acquisition.
    expect((model as any).findOneAndUpdate).toBeUndefined();
  });

  it('returns 404 when the record does not exist', async () => {
    const model = makeDomainModel(false);
    const { acquireEditLock } = createEditLockHandlers(model, 'lpo_summaries');
    const req: any = { params: { id: 'missing' }, user: { username: 'alice' } };

    await expect(acquireEditLock(req, makeRes())).rejects.toMatchObject({ statusCode: 404 });
    expect(mockEditLock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('translates a duplicate-key error into 423 with the holder name', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOneAndUpdate.mockRejectedValue({ code: 11000 });
    mockEditLock.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ lockedBy: 'bob', lockedByName: 'Bob B' }),
    });
    const { acquireEditLock } = createEditLockHandlers(model, 'lpo_summaries');
    const req: any = { params: { id: 'doc1' }, user: { username: 'alice' } };

    await expect(acquireEditLock(req, makeRes())).rejects.toMatchObject({
      statusCode: 423,
      data: { editLock: { lockedByName: 'Bob B' } },
    });
  });

  it('rejects unauthenticated callers with 401', async () => {
    const model = makeDomainModel(true);
    const { acquireEditLock } = createEditLockHandlers(model, 'lpo_summaries');
    const req: any = { params: { id: 'doc1' }, user: undefined };
    await expect(acquireEditLock(req, makeRes())).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('releaseEditLock', () => {
  it('deletes the caller\'s own lock and responds success', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOneAndDelete.mockResolvedValue({ _id: 'lock1' });
    const { releaseEditLock } = createEditLockHandlers(model, 'lpo_summaries');
    const req: any = { params: { id: 'doc1' }, user: { username: 'alice' } };
    const res = makeRes();

    await releaseEditLock(req, res);
    expect(mockEditLock.findOneAndDelete).toHaveBeenCalledWith({
      collectionName: 'lpo_summaries', documentId: 'doc1', lockedBy: 'alice',
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('is idempotent when no lock exists', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOneAndDelete.mockResolvedValue(null);
    mockEditLock.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    const { releaseEditLock } = createEditLockHandlers(model, 'lpo_summaries');
    const req: any = { params: { id: 'doc1' }, user: { username: 'alice' } };
    const res = makeRes();

    await releaseEditLock(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects with 403 when the lock is held by someone else', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOneAndDelete.mockResolvedValue(null);
    mockEditLock.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ lockedBy: 'bob' }) });
    const { releaseEditLock } = createEditLockHandlers(model, 'lpo_summaries');
    const req: any = { params: { id: 'doc1' }, user: { username: 'alice' } };

    await expect(releaseEditLock(req, makeRes())).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('enforceEditLock', () => {
  it('passes when the caller holds a valid lock', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        lockedBy: 'alice', lockedUntil: new Date(Date.now() + 60_000),
      }),
    });
    await expect(enforceEditLock(model, 'doc1', 'alice', 'lpo_summaries')).resolves.toBeUndefined();
  });

  it('throws 409 when no lock has been acquired', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    await expect(enforceEditLock(model, 'doc1', 'alice', 'lpo_summaries'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 409 when the lock has expired', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        lockedBy: 'alice', lockedUntil: new Date(Date.now() - 1000),
      }),
    });
    await expect(enforceEditLock(model, 'doc1', 'alice', 'lpo_summaries'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 423 when another user holds the lock', async () => {
    const model = makeDomainModel(true);
    mockEditLock.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        lockedBy: 'bob', lockedByName: 'Bob B', lockedUntil: new Date(Date.now() + 60_000),
      }),
    });
    await expect(enforceEditLock(model, 'doc1', 'alice', 'lpo_summaries'))
      .rejects.toMatchObject({ statusCode: 423, data: { editLock: { lockedByName: 'Bob B' } } });
  });

  it('returns early (lets the update handle 404) when the record is gone', async () => {
    const model = makeDomainModel(false);
    await expect(enforceEditLock(model, 'gone', 'alice', 'lpo_summaries')).resolves.toBeUndefined();
    expect(mockEditLock.findOne).not.toHaveBeenCalled();
  });
});
