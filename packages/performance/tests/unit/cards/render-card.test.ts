import { requiredPermissionFor } from '@seta/agent-sdk';
import { makeToolContext } from '@seta/agent-sdk/testing';
import { describe, expect, it } from 'vitest';
import { renderCardTool } from '../../../src/backend/agent-tools/render-card.ts';
import type { CardPayload } from '../../../src/backend/cards/schema.ts';

type Audience = 'hr' | 'leader' | 'bod';

function ctxFor(audience: Audience) {
  return makeToolContext({
    user_id: `u-${audience}`,
    permissions: ['performance.norm.read'],
    role_summary: { roles: [`performance.${audience}`], cross_tenant_read: false },
  });
}

async function render(audience: Audience, input: Record<string, unknown>): Promise<CardPayload> {
  const out = (await renderCardTool.execute!(input as never, ctxFor(audience))) as {
    card: CardPayload;
  };
  return out.card;
}

describe('performance_renderCard tool', () => {
  it('is gated on performance.norm.read', () => {
    expect(requiredPermissionFor(renderCardTool)).toBe('performance.norm.read');
  });

  it('renders a full employee profile card for HR', async () => {
    const card = await render('hr', {
      card_type: 'employee_profile_report',
      member_id: 'EMP-031',
    });
    expect(card.type).toBe('employee_profile_report');
    if (card.type === 'employee_profile_report') {
      expect(card.employee.memberId).toBe('EMP-031');
      expect(card.riskBadge).toBe('high');
    }
  });

  it('renders a compact inline transcript card', async () => {
    const card = await render('leader', {
      card_type: 'inline_transcript',
      member_id: 'EMP-031',
    });
    expect(card.type).toBe('inline_transcript');
  });

  it('returns an access-denied card when a non-HR audience requests sensitive content', async () => {
    const card = await render('leader', {
      card_type: 'employee_profile_report',
      member_id: 'EMP-031',
      include_sensitive: true,
    });
    expect(card.type).toBe('access_denied');
    if (card.type === 'access_denied') {
      expect(card.currentRole).toBe('Leader role');
      expect(card.requiredRole).toBe('HR role required');
    }
  });

  it('does NOT deny HR when sensitive content is requested', async () => {
    const card = await render('hr', {
      card_type: 'employee_profile_report',
      member_id: 'EMP-031',
      include_sensitive: true,
    });
    expect(card.type).toBe('employee_profile_report');
  });

  it('shows names in the at-risk list for a leader', async () => {
    const card = await render('leader', { card_type: 'at_risk_list', account_id: 'ACC-B' });
    expect(card.type).toBe('at_risk_list');
    if (card.type === 'at_risk_list') {
      expect(card.title).toContain('Account B');
      expect(card.employees.map((e) => e.name)).toContain('Nguyễn Thị Lan');
    }
  });

  it('redacts names in the at-risk list for the BOD audience', async () => {
    const card = await render('bod', { card_type: 'at_risk_list', account_id: 'ACC-B' });
    if (card.type === 'at_risk_list') {
      for (const e of card.employees) expect(e.name).toBe(e.memberId);
    }
  });

  it('renders the account-level summary', async () => {
    const card = await render('bod', { card_type: 'account_summary' });
    expect(card.type).toBe('account_summary');
    if (card.type === 'account_summary') {
      expect(card.counts.high).toBe(8);
      expect(card.totalEmployees).toBe(124);
      expect(card.highPct).toBe(6);
    }
  });

  it('renders a human-review flag carrying the conclusion', async () => {
    const card = await render('hr', {
      card_type: 'human_review_flag',
      conclusion:
        'EMP-031 is flagged for potential PIP consideration based on the 3-month KPI trend.',
    });
    expect(card.type).toBe('human_review_flag');
    if (card.type === 'human_review_flag') {
      expect(card.conclusion).toContain('PIP');
    }
  });

  it('rejects when a profile card is requested without member_id', async () => {
    // The tool guards against a missing id; the wrap layer sanitises the thrown
    // message, so we assert on the rejection rather than its text.
    await expect(render('hr', { card_type: 'employee_profile_report' })).rejects.toThrow();
  });
});
