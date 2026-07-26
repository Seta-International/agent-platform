import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CycleStatus } from '../../../src/api/people-client.ts';
import {
  CYCLE_STATUS_LABEL,
  CycleStatusBadge,
} from '../../../src/components/cycle-status-badge.tsx';

describe('CycleStatusBadge (AC3 — echo only)', () => {
  const cases: CycleStatus[] = ['open', 'makeup', 'locked', 'override'];

  for (const status of cases) {
    it(`renders server flag ${status} with label+icon channel`, () => {
      render(<CycleStatusBadge status={status} />);
      const el = screen.getByTestId('cycle-status-badge');
      expect(el).toHaveTextContent(CYCLE_STATUS_LABEL[status]);
      expect(el).toHaveAttribute('role', 'status');
    });
  }
});
