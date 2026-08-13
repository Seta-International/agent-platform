import { describe, expect, it } from 'vitest';
import { computeCategoryHealth, computeOverallHealth } from '../../src/contracts.ts';

describe('computeCategoryHealth — unassessed metrics take no part', () => {
  it('is the worst of the metrics that were assessed', () => {
    expect(computeCategoryHealth(['green', 'yellow'])).toBe('yellow');
    expect(computeCategoryHealth(['green', 'yellow', 'red'])).toBe('red');
    expect(computeCategoryHealth(['green', 'green'])).toBe('green');
  });

  it('has no colour when nothing in the category was assessed', () => {
    expect(computeCategoryHealth([])).toBeNull();
  });
});

describe('computeOverallHealth — pillars with nothing assessed do not drag the week down', () => {
  it('is Green when the assessed pillars are Green and the rest are blank', () => {
    expect(computeOverallHealth(['green', null, null, null])).toBe('green');
    expect(computeOverallHealth(['green', 'green', null, null])).toBe('green');
  });

  it('still surfaces the worst assessed pillar', () => {
    expect(computeOverallHealth(['green', 'yellow', null, null])).toBe('yellow');
    expect(computeOverallHealth([null, 'red', null, 'green'])).toBe('red');
  });

  it('has no colour when the whole week is unassessed', () => {
    expect(computeOverallHealth([null, null, null, null])).toBeNull();
    expect(computeOverallHealth([])).toBeNull();
  });
});
