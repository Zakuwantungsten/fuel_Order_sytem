import { FuelRecord } from '../../../models';
import { createTestFuelRecord } from '../../helpers/testUtils';
import { suspendJourney, restoreSuspendedJourney } from '../../../services/journeyService';

describe('journey suspend / unsuspend', () => {
  it('suspends an active journey and promotes the next queued one', async () => {
    const active = await createTestFuelRecord({
      truckNo: 'T600 SUS',
      goingDo: 'DO-SUS-ACTIVE',
      journeyStatus: 'active',
    });
    const queued = await createTestFuelRecord({
      truckNo: 'T600 SUS',
      goingDo: 'DO-SUS-QUEUED',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    const result = await suspendJourney(active._id.toString(), 'tester');

    expect(result.record.journeyStatus).toBe('suspended');
    expect(result.record.suspendedFromJourneyStatus).toBe('active');
    expect(String(result.record.suspendPromotedSuccessorId)).toBe(String(queued._id));
    expect(String(result.promotedId)).toBe(String(queued._id));

    const refreshedQueued = await FuelRecord.findById(queued._id);
    expect(refreshedQueued?.journeyStatus).toBe('active');
  });

  it('suspends a queued journey without promoting', async () => {
    const active = await createTestFuelRecord({
      truckNo: 'T601 SUS',
      goingDo: 'DO-SUS-A2',
      journeyStatus: 'active',
    });
    const queued = await createTestFuelRecord({
      truckNo: 'T601 SUS',
      goingDo: 'DO-SUS-Q2',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    const result = await suspendJourney(queued._id.toString(), 'tester');

    expect(result.record.journeyStatus).toBe('suspended');
    expect(result.record.suspendedFromJourneyStatus).toBe('queued');
    expect(result.promotedId).toBeNull();

    const stillActive = await FuelRecord.findById(active._id);
    expect(stillActive?.journeyStatus).toBe('active');
  });

  it('rejects suspending a completed journey', async () => {
    const completed = await createTestFuelRecord({
      truckNo: 'T602 SUS',
      goingDo: 'DO-SUS-DONE',
      journeyStatus: 'completed',
    });

    await expect(suspendJourney(completed._id.toString(), 'tester')).rejects.toThrow(
      /active or queued/i
    );
  });

  it('unsuspends an active-origin journey and restores the successor to the queue', async () => {
    const active = await createTestFuelRecord({
      truckNo: 'T603 SUS',
      goingDo: 'DO-UNSUS-ACTIVE',
      journeyStatus: 'active',
    });
    const queued = await createTestFuelRecord({
      truckNo: 'T603 SUS',
      goingDo: 'DO-UNSUS-QUEUED',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    await suspendJourney(active._id.toString(), 'tester');
    const restored = await restoreSuspendedJourney(active._id.toString(), 'tester');

    expect(restored.record.journeyStatus).toBe('active');
    expect(restored.record.suspendedFromJourneyStatus).toBeUndefined();

    const restoredQueued = await FuelRecord.findById(queued._id);
    expect(restoredQueued?.journeyStatus).toBe('queued');
    expect(restoredQueued?.queueOrder).toBe(1);
  });

  it('unsuspends a queued-origin journey back into the queue', async () => {
    await createTestFuelRecord({
      truckNo: 'T604 SUS',
      goingDo: 'DO-UNSUS-A3',
      journeyStatus: 'active',
    });
    const queued = await createTestFuelRecord({
      truckNo: 'T604 SUS',
      goingDo: 'DO-UNSUS-Q3',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    await suspendJourney(queued._id.toString(), 'tester');
    const restored = await restoreSuspendedJourney(queued._id.toString(), 'tester');

    expect(restored.record.journeyStatus).toBe('queued');
    expect(restored.record.queueOrder).toBe(1);
  });
});
