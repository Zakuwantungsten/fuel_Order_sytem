import { FuelRecord, PendingDoHistory } from '../../../models';
import { cancelPendingDo } from '../../../services/pendingDoService';
import { createTestFuelRecord } from '../../helpers/testUtils';

jest.mock('../../../services/websocket', () => ({
  emitDataChange: jest.fn(),
}));

jest.mock('../../../services/journeyService', () => ({
  afterJourneyCancelled: jest.fn().mockResolvedValue({ affectedIds: [] }),
}));

describe('cancelPendingDo', () => {
  it('cancels a pending going DO and marks the fuel record cancelled', async () => {
    const record = await createTestFuelRecord({
      truckNo: 'T555 AAA',
      goingDo: 'PG0001',
      isPendingGoing: true,
      journeyStatus: 'active',
      from: 'TBA',
      to: 'TBA',
      start: 'TBA',
      balance: 0,
    });

    await PendingDoHistory.create({
      kind: 'going',
      pendingDo: 'PG0001',
      truckNo: 'T555 AAA',
      fuelRecordId: record._id,
      status: 'pending',
      pendingAt: new Date(),
      createdBy: 'tester',
    });

    const result = await cancelPendingDo({
      fuelRecordId: String(record._id),
      kind: 'going',
      username: 'tester',
    });

    expect(result.cancelledWholeRecord).toBe(true);
    expect(result.pendingDo).toBe('PG0001');

    const reloaded = await FuelRecord.findById(record._id);
    expect(reloaded?.isCancelled).toBe(true);

    const history = await PendingDoHistory.findOne({ fuelRecordId: record._id, kind: 'going' });
    expect(history).toBeNull();
  });

  it('revokes a pending return DO and restores the going route without cancelling the journey', async () => {
    const record = await createTestFuelRecord({
      truckNo: 'T666 BBB',
      goingDo: '1234/26',
      returnDo: 'PR0001',
      isPendingReturn: true,
      originalGoingFrom: 'DAR ES SALAAM',
      originalGoingTo: 'LUBUMBASHI',
      from: 'TBA',
      to: 'TBA',
      journeyStatus: 'completed',
    });

    await PendingDoHistory.create({
      kind: 'return',
      pendingDo: 'PR0001',
      truckNo: 'T666 BBB',
      fuelRecordId: record._id,
      status: 'pending',
      pendingAt: new Date(),
      createdBy: 'tester',
    });

    const result = await cancelPendingDo({
      fuelRecordId: String(record._id),
      kind: 'return',
      username: 'tester',
    });

    expect(result.cancelledWholeRecord).toBe(false);
    expect(result.pendingDo).toBe('PR0001');

    const reloaded = await FuelRecord.findById(record._id);
    expect(reloaded?.isCancelled).not.toBe(true);
    expect(reloaded?.isPendingReturn).toBe(false);
    expect(reloaded?.returnDo).toBeFalsy();
    expect(reloaded?.from).toBe('DAR ES SALAAM');
    expect(reloaded?.to).toBe('LUBUMBASHI');

    const history = await PendingDoHistory.findOne({ fuelRecordId: record._id, kind: 'return' });
    expect(history).toBeNull();
  });

  it('rejects cancel return when no pending return exists', async () => {
    const record = await createTestFuelRecord({
      truckNo: 'T777 CCC',
      goingDo: '5678/26',
      journeyStatus: 'active',
    });

    await expect(
      cancelPendingDo({
        fuelRecordId: String(record._id),
        kind: 'return',
        username: 'tester',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
