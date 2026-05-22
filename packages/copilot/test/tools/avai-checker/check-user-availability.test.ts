import { describe, expect, it, vi } from 'vitest';
import { requiredPermissionFor } from '../../../src/backend/tools/_types.ts';
import {
  type LeaveRecord,
  makeAvaiCheckerCheckUserAvailabilityTool,
} from '../../../src/backend/tools/avai-checker/check-user-availability.ts';
import { makeToolContext } from '../../test-helpers.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CALLER_ID = '99999999-9999-4999-8999-999999999999';
const TODAY = new Date().toISOString().slice(0, 10);

const APPROVED_LEAVE: LeaveRecord = {
  leave_id: 'leave-annual-001',
  employee_id: USER_ID,
  start_date: '2026-01-01',
  end_date: '2099-12-31',
  type: 'annual',
  status: 'approved',
};

describe('avaiChecker_checkUserAvailability tool', () => {
  it('returns available when no active leave found', async () => {
    const tool = makeAvaiCheckerCheckUserAvailabilityTool({
      getActiveLeave: vi.fn().mockResolvedValue(null),
    });

    const out = (await tool.execute!(
      { user_id: USER_ID },
      makeToolContext({ user_id: CALLER_ID }),
    )) as {
      user_id: string;
      date: string;
      status: string;
      note: string | null;
      is_available: boolean;
    };

    expect(out.user_id).toBe(USER_ID);
    expect(out.status).toBe('available');
    expect(out.is_available).toBe(true);
    expect(out.note).toBeNull();
    expect(out.date).toBe(TODAY);
  });

  it('returns ooo when an approved leave record covers today', async () => {
    const tool = makeAvaiCheckerCheckUserAvailabilityTool({
      getActiveLeave: vi.fn().mockResolvedValue(APPROVED_LEAVE),
    });

    const out = (await tool.execute!(
      { user_id: USER_ID },
      makeToolContext({ user_id: CALLER_ID }),
    )) as { status: string; note: string | null; is_available: boolean };

    expect(out.status).toBe('ooo');
    expect(out.is_available).toBe(false);
    expect(out.note).toBe('annual');
  });

  it('passes the given date to getActiveLeave instead of today', async () => {
    const getActiveLeave = vi.fn().mockResolvedValue(null);
    const tool = makeAvaiCheckerCheckUserAvailabilityTool({ getActiveLeave });

    await tool.execute!(
      { user_id: USER_ID, date: '2026-06-01' },
      makeToolContext({ user_id: CALLER_ID }),
    );

    expect(getActiveLeave).toHaveBeenCalledWith({ userId: USER_ID, date: '2026-06-01' });
  });

  it('note reflects the leave type (sick, personal, unpaid)', async () => {
    const sickLeave: LeaveRecord = { ...APPROVED_LEAVE, type: 'sick' };
    const tool = makeAvaiCheckerCheckUserAvailabilityTool({
      getActiveLeave: vi.fn().mockResolvedValue(sickLeave),
    });

    const out = (await tool.execute!(
      { user_id: USER_ID },
      makeToolContext({ user_id: CALLER_ID }),
    )) as { note: string | null };

    expect(out.note).toBe('sick');
  });

  it('is registered with permission identity.user.read.any', () => {
    const tool = makeAvaiCheckerCheckUserAvailabilityTool({ getActiveLeave: vi.fn() });
    expect(requiredPermissionFor(tool)).toBe('identity.user.read.any');
  });
});
