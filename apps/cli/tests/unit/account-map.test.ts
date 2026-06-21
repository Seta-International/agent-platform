import { describe, expect, it } from 'vitest';
import { accountFor } from '../../src/commands/seed-fixture/account-map.ts';

describe('accountFor', () => {
  it('known external clients get their own account with the right industry', () => {
    expect(accountFor('Veritone')).toEqual({ account_name: 'Veritone', industry: 'AI' });
    expect(accountFor('Aeris')).toEqual({ account_name: 'Aeris', industry: 'IoT' });
    expect(accountFor('Gridbeyond Energy')).toEqual({
      account_name: 'Gridbeyond Energy',
      industry: 'Energy',
    });
    expect(accountFor('Sunwest')).toEqual({ account_name: 'Sunwest', industry: 'Finance' });
    expect(accountFor('Motion Global')).toEqual({
      account_name: 'Motion Global',
      industry: 'E-commerce',
    });
    expect(accountFor('Commerce Canal')).toEqual({
      account_name: 'Commerce Canal',
      industry: 'E-commerce',
    });
    expect(accountFor('JetX')).toEqual({ account_name: 'JetX', industry: 'Software' });
    expect(accountFor('Teacher Zone')).toEqual({
      account_name: 'Teacher Zone',
      industry: 'EdTech',
    });
    expect(accountFor('SSP')).toEqual({ account_name: 'SSP', industry: 'Software' });
    expect(accountFor('Smart System Pro')).toEqual({
      account_name: 'Smart System Pro',
      industry: 'Software',
    });
  });

  it('unknown project names map to SETA Internal', () => {
    expect(accountFor('Internal Dashboard')).toEqual({
      account_name: 'SETA Internal',
      industry: 'Internal',
    });
    expect(accountFor('HR System')).toEqual({
      account_name: 'SETA Internal',
      industry: 'Internal',
    });
    expect(accountFor('')).toEqual({ account_name: 'SETA Internal', industry: 'Internal' });
    expect(accountFor('STP - Internal Project')).toEqual({
      account_name: 'SETA Internal',
      industry: 'Internal',
    });
  });
});
