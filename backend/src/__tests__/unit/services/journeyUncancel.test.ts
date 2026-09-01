import { FuelRecord } from '../../../models';
import { createTestFuelRecord } from '../../helpers/testUtils';
import {
  afterJourneyCancelled,
  restoreJourneyOnFuelRecordUncancel,
} from '../../../services/journeyService';

jest.mock('../../../services/websocket', () => ({
  emitDataChange: jest.fn(),
}));

describe('restoreJourneyOnFuelRecordUncancel', () => {
  it('restores an active journey and demotes the promoted successor back to the queue', async () => {
    const active = await createTestFuelRecord({
      truckNo: 'T600 UNC',
      goingDo: 'DO-UNC-ACTIVE',
      journeyStatus: 'active',
    });
    const queued = await createTestFuelRecord({
      truckNo: 'T600 UNC',
      goingDo: 'DO-UNC-QUEUED',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    await FuelRecord.findByIdAndUpdate(active._id, {
      isCancelled: true,
      cancelledAt: new Date(),
      cancelledBy: 'tester',
    });

    await afterJourneyCancelled(active._id.toString(), 'tester', {
      wasActive: true,
      wasQueued: false,
    });

    const promoted = await FuelRecord.findById(queued._id);
    expect(promoted?.journeyStatus).toBe('active');

    const cancelledActive = await FuelRecord.findById(active._id);
    expect(cancelledActive?.journeyStatus).toBe('completed');
    expect(cancelledActive?.cancelledFromJourneyStatus).toBe('active');
    expect(String(cancelledActive?.cancelPromotedSuccessorId)).toBe(String(queued._id));

    const restored = await restoreJourneyOnFuelRecordUncancel(active._id.toString(), 'tester');

    expect(restored.record.isCancelled).toBe(false);
    expect(restored.record.journeyStatus).toBe('active');

    const successor = await FuelRecord.findById(queued._id);
    expect(successor?.journeyStatus).toBe('queued');
    expect(successor?.queueOrder).toBe(1);
  });

  it('restores a queued journey back into the truck queue', async () => {
    const active = await createTestFuelRecord({
      truckNo: 'T601 UNC',
      goingDo: 'DO-UNC2-ACTIVE',
      journeyStatus: 'active',
    });
    const queued = await createTestFuelRecord({
      truckNo: 'T601 UNC',
      goingDo: 'DO-UNC2-QUEUED',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    await FuelRecord.findByIdAndUpdate(queued._id, {
      isCancelled: true,
      cancelledAt: new Date(),
      cancelledBy: 'tester',
    });

    await afterJourneyCancelled(queued._id.toString(), 'tester', {
      wasActive: false,
      wasQueued: true,
    });

    const cancelledQueued = await FuelRecord.findById(queued._id);
    expect(cancelledQueued?.journeyStatus).toBe('cancelled');
    expect(cancelledQueued?.cancelledFromJourneyStatus).toBe('queued');
    expect(cancelledQueued?.cancelledFromQueueOrder).toBe(1);

    const stillActive = await FuelRecord.findById(active._id);
    expect(stillActive?.journeyStatus).toBe('active');

    const restored = await restoreJourneyOnFuelRecordUncancel(queued._id.toString(), 'tester');

    expect(restored.record.isCancelled).toBe(false);
    expect(restored.record.journeyStatus).toBe('queued');
    expect(restored.record.queueOrder).toBe(1);
  });

  it('only clears isCancelled for legacy cancels without snapshots', async () => {
    const record = await createTestFuelRecord({
      truckNo: 'T602 UNC',
      goingDo: 'DO-LEGACY',
      journeyStatus: 'completed',
      isCancelled: true,
      cancelledAt: new Date(),
      cancelledBy: 'tester',
    });

    const restored = await restoreJourneyOnFuelRecordUncancel(record._id.toString(), 'tester');

    expect(restored.record.isCancelled).toBe(false);
    expect(restored.record.journeyStatus).toBe('completed');
  });
});
