import { describe, expect, it } from 'vitest';
import { activeNavId, buildNavModules } from './-nav';

describe('buildNavModules', () => {
  it('planner module includes my-tasks item before groups', () => {
    const modules = buildNavModules([]);
    const planner = modules.find((m) => m.id === 'planner');
    expect(planner).toBeDefined();
    const items = planner!.items;
    const myTasksIdx = items.findIndex((i) => i.id === 'planner.my-tasks');
    const groupsIdx = items.findIndex((i) => i.id === 'planner.groups');
    expect(myTasksIdx).toBeGreaterThanOrEqual(0);
    expect(groupsIdx).toBeGreaterThanOrEqual(0);
    expect(myTasksIdx).toBeLessThan(groupsIdx);
  });

  it('my-tasks item has correct href and label', () => {
    const modules = buildNavModules([]);
    const planner = modules.find((m) => m.id === 'planner');
    const item = planner!.items.find((i) => i.id === 'planner.my-tasks');
    expect(item).toMatchObject({ id: 'planner.my-tasks', href: '/planner/my-tasks' });
    expect(item!.label.toLowerCase()).toContain('my task');
  });
});

describe('activeNavId', () => {
  it('returns planner.my-tasks for /planner/my-tasks', () => {
    expect(activeNavId('/planner/my-tasks')).toBe('planner.my-tasks');
  });

  it('returns planner.my-tasks for /planner/my-tasks/anything', () => {
    expect(activeNavId('/planner/my-tasks/foo')).toBe('planner.my-tasks');
  });

  it('returns planner.groups for /planner/groups', () => {
    expect(activeNavId('/planner/groups')).toBe('planner.groups');
  });
});
