import { FuelRecord } from '../../../models';
import { createTestFuelRecord } from '../../helpers/testUtils';
import {
  completeJourneyManually,
  reopenManuallyCompletedJourney,
} from '../../../services/journeyService';

describe('manual journey complete / undo', () => {
  it('completes the active journey and promotes the next queued one', async () => {
    const active = await createTestFuelRecord({
      truckNo: 'T500 CMP',
      goingDo: 'DO-CMP-ACTIVE',
      journeyStatus: 'active',
    });
    const queued = await createTestFuelRecord({
      truckNo: 'T500 CMP',
      goingDo: 'DO-CMP-QUEUED',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    const result = await completeJourneyManually(active._id.toString(), 'tester');

    expect(result.record.journeyStatus).toBe('completed');
    expect(result.record.manuallyCompleted).toBe(true);
    expect(String(result.record.promotedSuccessorId)).toBe(String(queued._id));
    expect(String(result.promotedId)).toBe(String(queued._id));

    const refreshedQueued = await FuelRecord.findById(queued._id);
    expect(refreshedQueued?.journeyStatus).toBe('active');
  });

  it('rejects completing a queued journey', async () => {
    const queued = await createTestFuelRecord({
      truckNo: 'T501 CMP',
      goingDo: 'DO-CMP-QONLY',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    await expect(
      completeJourneyManually(queued._id.toString(), 'tester')
    ).rejects.toThrow(/active journey/i);
  });

  it('undoes a manual complete and restores the successor to the queue', async () => {
    const active = await createTestFuelRecord({
      truckNo: 'T502 CMP',
      goingDo: 'DO-UNCMP-ACTIVE',
      journeyStatus: 'active',
    });
    const queued = await createTestFuelRecord({
      truckNo: 'T502 CMP',
      goingDo: 'DO-UNCMP-QUEUED',
      journeyStatus: 'queued',
      queueOrder: 1,
    });

    await completeJourneyManually(active._id.toString(), 'tester');
    const undone = await reopenManuallyCompletedJourney(active._id.toString(), 'tester');

    expect(undone.record.journeyStatus).toBe('active');
    expect(undone.record.manuallyCompleted).toBe(false);

    const restoredQueued = await FuelRecord.findById(queued._id);
    expect(restoredQueued?.journeyStatus).toBe('queued');
    expect(restoredQueued?.queueOrder).toBe(1);
  });

  it('does not undo an automatically completed journey', async () => {
    const autoCompleted = await createTestFuelRecord({
      truckNo: 'T503 CMP',
      goingDo: 'DO-AUTO-DONE',
      journeyStatus: 'completed',
      completedAt: new Date(),
      manuallyCompleted: false,
    });

    await expect(
      reopenManuallyCompletedJourney(autoCompleted._id.toString(), 'tester')
    ).rejects.toThrow(/automatically/i);
  });
});
