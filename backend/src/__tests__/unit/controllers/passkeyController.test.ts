// Unit tests for the passkey (WebAuthn) controller. All collaborators are mocked
// — no database, no real crypto ceremony. We verify control flow: challenge
// validation, counter persistence, credential creation, enumeration-safety, and
// that a verified login delegates to issueSession with loginMethod 'passkey'.
// See PASSKEY_IMPLEMENTATION.md (Phase 3).

const mockUser = { findById: jest.fn(), findOne: jest.fn() };
const mockPasskey = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndDelete: jest.fn(),
  findOneAndUpdate: jest.fn(),
};
const mockSystemConfig = { findOne: jest.fn() };

jest.mock('../../../models', () => ({
  User: mockUser,
  Passkey: mockPasskey,
  SystemConfig: mockSystemConfig,
}));

const mockWebauthn = {
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
};
jest.mock('@simplewebauthn/server', () => mockWebauthn);

const mockChallengeSvc = {
  saveRegistrationChallenge: jest.fn(),
  getRegistrationChallenge: jest.fn(),
  clearRegistrationChallenge: jest.fn(),
  saveLoginChallenge: jest.fn(),
  consumeLoginChallenge: jest.fn(),
};
jest.mock('../../../services/passkeyChallengeService', () => mockChallengeSvc);

const mockIssueSession = jest.fn();
jest.mock('../../../controllers/authController', () => ({
  issueSession: mockIssueSession,
}));

jest.mock('../../../config', () => ({
  config: {
    webauthnRpId: 'localhost',
    webauthnRpName: 'Test RP',
    webauthnOrigins: ['http://localhost:5173'],
    // Fields read by the real logger (loaded transitively via errorHandler):
    logFile: 'logs/test.log',
    logLevel: 'error',
    nodeEnv: 'test',
  },
}));

jest.mock('../../../utils', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import {
  passkeyRegisterVerify,
  passkeyLoginOptions,
  passkeyLoginVerify,
  listPasskeys,
  deletePasskey,
  renamePasskey,
} from '../../../controllers/passkeyController';

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
}

beforeEach(() => jest.clearAllMocks());

describe('passkeyLoginVerify', () => {
  const baseReq = () => ({
    body: { challengeToken: 'tok', response: { id: 'cred1' }, rememberMe: false },
  } as any);

  it('rejects an invalid/expired challenge with 401', async () => {
    mockChallengeSvc.consumeLoginChallenge.mockResolvedValue(null);
    await expect(passkeyLoginVerify(baseReq(), makeRes())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an unknown credential with 401', async () => {
    mockChallengeSvc.consumeLoginChallenge.mockResolvedValue({ challenge: 'c', userId: null });
    mockPasskey.findOne.mockResolvedValue(null);
    await expect(passkeyLoginVerify(baseReq(), makeRes())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('updates the counter and issues a passkey session on success', async () => {
    mockChallengeSvc.consumeLoginChallenge.mockResolvedValue({ challenge: 'c', userId: null });
    const passkey: any = {
      credentialID: 'cred1',
      publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
      counter: 1,
      transports: ['internal'],
      userId: { toString: () => 'u1' },
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockPasskey.findOne.mockResolvedValue(passkey);
    mockWebauthn.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 7 },
    });
    mockUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'u1', username: 'alice', isActive: true, isDeleted: false, isBanned: false,
      }),
    });
    mockSystemConfig.findOne.mockResolvedValue(null);

    await passkeyLoginVerify(baseReq(), makeRes());

    expect(passkey.counter).toBe(7);
    expect(passkey.save).toHaveBeenCalled();
    expect(mockIssueSession).toHaveBeenCalledTimes(1);
    const opts = mockIssueSession.mock.calls[0][3];
    expect(opts).toMatchObject({ loginMethod: 'passkey', sessionKillContext: 'new passkey login' });
  });

  it('rejects when the credential belongs to a different user than the challenge', async () => {
    mockChallengeSvc.consumeLoginChallenge.mockResolvedValue({ challenge: 'c', userId: { toString: () => 'u1' } });
    mockPasskey.findOne.mockResolvedValue({ credentialID: 'cred1', userId: { toString: () => 'u2' } });
    await expect(passkeyLoginVerify(baseReq(), makeRes())).rejects.toMatchObject({ statusCode: 401 });
    expect(mockIssueSession).not.toHaveBeenCalled();
  });
});

describe('passkeyRegisterVerify', () => {
  const req = () => ({
    user: { userId: 'u1', username: 'alice' },
    body: { label: 'My Laptop', id: 'cred1' },
  } as any);

  it('rejects when there is no active challenge', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', username: 'alice', firstName: 'A', lastName: 'L' });
    mockChallengeSvc.getRegistrationChallenge.mockResolvedValue(null);
    await expect(passkeyRegisterVerify(req(), makeRes())).rejects.toMatchObject({ statusCode: 400 });
  });

  it('persists the credential on a verified attestation', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', username: 'alice', firstName: 'A', lastName: 'L' });
    mockChallengeSvc.getRegistrationChallenge.mockResolvedValue('chal');
    mockWebauthn.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'cred1', publicKey: new Uint8Array([9, 8, 7]), counter: 0, transports: ['internal'] },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    });
    mockPasskey.findOne.mockResolvedValue(null);
    mockPasskey.create.mockResolvedValue({});
    const res = makeRes();

    await passkeyRegisterVerify(req(), res);

    expect(mockPasskey.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', credentialID: 'cred1', label: 'My Laptop', backedUp: true, deviceType: 'multiDevice',
    }));
    expect(mockChallengeSvc.clearRegistrationChallenge).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects a duplicate credential with 409', async () => {
    mockUser.findById.mockResolvedValue({ _id: 'u1', username: 'alice', firstName: 'A', lastName: 'L' });
    mockChallengeSvc.getRegistrationChallenge.mockResolvedValue('chal');
    mockWebauthn.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'cred1', publicKey: new Uint8Array([1]), counter: 0, transports: [] },
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
      },
    });
    mockPasskey.findOne.mockResolvedValue({ credentialID: 'cred1' }); // already registered
    await expect(passkeyRegisterVerify(req(), makeRes())).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPasskey.create).not.toHaveBeenCalled();
  });
});

describe('passkeyLoginOptions (enumeration-safe)', () => {
  it('returns options + token even for an unknown username', async () => {
    mockUser.findOne.mockResolvedValue(null);
    mockWebauthn.generateAuthenticationOptions.mockResolvedValue({ challenge: 'c', allowCredentials: [] });
    mockChallengeSvc.saveLoginChallenge.mockResolvedValue('tok');
    const res = makeRes();

    await passkeyLoginOptions({ body: { username: 'ghost' } } as any, res);

    expect(mockPasskey.find).not.toHaveBeenCalled(); // no user → no credential lookup
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ challengeToken: 'tok' }),
    }));
  });
});

describe('passkey management', () => {
  it('lists the current user passkeys', async () => {
    const chain: any = {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue([{ label: 'Phone' }]),
    };
    mockPasskey.find.mockReturnValue(chain);
    const res = makeRes();
    await listPasskeys({ user: { userId: 'u1' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ label: 'Phone' }] });
  });

  it('404s deleting a passkey that does not belong to the user', async () => {
    mockPasskey.findOneAndDelete.mockResolvedValue(null);
    await expect(
      deletePasskey({ user: { userId: 'u1', username: 'alice' }, params: { id: 'x' } } as any, makeRes())
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects renaming with an empty label', async () => {
    await expect(
      renamePasskey({ user: { userId: 'u1' }, params: { id: 'x' }, body: { label: '  ' } } as any, makeRes())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('renames a passkey', async () => {
    mockPasskey.findOneAndUpdate.mockResolvedValue({ label: 'Work laptop' });
    const res = makeRes();
    await renamePasskey({ user: { userId: 'u1' }, params: { id: 'x' }, body: { label: 'Work laptop' } } as any, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { label: 'Work laptop' } }));
  });
});
