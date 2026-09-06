import { describe, expect, it } from 'vitest';
import { performanceConfigGroupInput } from '../../src/contracts.ts';

const GROUP_ID = '00000000-0000-4000-8000-000000000001';

function group(weight: number, criterionWeight = weight) {
  return {
    group_id: GROUP_ID,
    weight,
    criteria: [{ name: 'Throughput & velocity', weight: criterionWeight }],
  };
}

describe('performance config weights', () => {
  it('takes a whole percentage above zero', () => {
    expect(performanceConfigGroupInput.safeParse(group(20)).success).toBe(true);
  });

  // The screen is one client of this route; the rule belongs to the contract so a
  // second one cannot write a weight the first one refuses to offer.
  it.each([19.9, 0.5, 0, -10, 101])('refuses %p whoever sends it', (weight) => {
    expect(performanceConfigGroupInput.safeParse(group(20, 20)).success).toBe(true);
    expect(performanceConfigGroupInput.safeParse(group(weight, 20)).success).toBe(false);
  });

  it('holds a criterion to the same rule as its group', () => {
    expect(performanceConfigGroupInput.safeParse(group(20, 19.9)).success).toBe(false);
    expect(performanceConfigGroupInput.safeParse(group(20, 0)).success).toBe(false);
    expect(performanceConfigGroupInput.safeParse(group(20, -10)).success).toBe(false);
  });
});
