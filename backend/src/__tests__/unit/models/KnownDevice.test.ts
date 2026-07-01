import mongoose from 'mongoose';
import { KnownDevice, AUTO_TRUST_THRESHOLD } from '../../../models/KnownDevice';
import { createTestUser } from '../../helpers/testUtils';

describe('KnownDevice.recordDevice', () => {
  it('marks the first browser+os combination as a new device', async () => {
    const user = await createTestUser({ username: 'devuser1', email: 'dev1@test.com' });
    const userId = user._id.toString();

    const result = await (KnownDevice as any).recordDevice(
      userId, user.username, 'Google Chrome', 'Windows 10/11', 'desktop', '1.2.3.4',
    );

    expect(result.isNewDevice).toBe(true);
    expect(result.trusted).toBe(false);
    expect(result.device?.sessionCount).toBe(1);
  });

  it('does not mark repeat sign-ins from the same browser+os as new', async () => {
    const user = await createTestUser({ username: 'devuser2', email: 'dev2@test.com' });
    const userId = user._id.toString();

    await (KnownDevice as any).recordDevice(
      userId, user.username, 'Firefox', 'Linux', 'desktop', '1.2.3.4',
    );
    const second = await (KnownDevice as any).recordDevice(
      userId, user.username, 'Firefox', 'Linux', 'desktop', '5.6.7.8',
    );

    expect(second.isNewDevice).toBe(false);
    expect(second.trusted).toBe(false);
    expect(second.device?.sessionCount).toBe(2);
  });

  it(`auto-trusts a device after ${AUTO_TRUST_THRESHOLD} successful sign-ins`, async () => {
    const user = await createTestUser({ username: 'devuser3', email: 'dev3@test.com' });
    const userId = user._id.toString();

    let lastResult: any;
    for (let i = 0; i < AUTO_TRUST_THRESHOLD; i++) {
      lastResult = await (KnownDevice as any).recordDevice(
        userId, user.username, 'Safari', 'macOS', 'desktop', '9.9.9.9',
      );
    }

    expect(lastResult.isNewDevice).toBe(false);
    expect(lastResult.trusted).toBe(true);
    expect(lastResult.device?.sessionCount).toBe(AUTO_TRUST_THRESHOLD);
  });

  it('treats different browsers on the same OS as separate devices', async () => {
    const user = await createTestUser({ username: 'devuser4', email: 'dev4@test.com' });
    const userId = user._id.toString();

    const chrome = await (KnownDevice as any).recordDevice(
      userId, user.username, 'Google Chrome', 'Windows 10/11', 'desktop', '1.1.1.1',
    );
    const edge = await (KnownDevice as any).recordDevice(
      userId, user.username, 'Microsoft Edge', 'Windows 10/11', 'desktop', '1.1.1.1',
    );

    expect(chrome.isNewDevice).toBe(true);
    expect(edge.isNewDevice).toBe(true);

    const chromeAgain = await (KnownDevice as any).recordDevice(
      userId, user.username, 'Google Chrome', 'Windows 10/11', 'desktop', '1.1.1.1',
    );
    expect(chromeAgain.isNewDevice).toBe(false);
  });
});
