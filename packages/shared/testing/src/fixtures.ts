import type { DomainEvent } from '@seta/shared-types';

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  suspendedAt: Date | null;
}

export const fixtures = {
  tenant(over: Partial<TenantRow> = {}): TenantRow {
    return {
      id: crypto.randomUUID(),
      name: 'Acme Inc',
      slug: 'acme',
      createdAt: new Date(),
      suspendedAt: null,
      ...over,
    };
  },
  event<P>(over: Partial<DomainEvent<P>> = {}): DomainEvent<P> {
    return {
      id: crypto.randomUUID(),
      occurredAt: new Date(),
      tenantId: crypto.randomUUID(),
      aggregateType: 'test.entity',
      aggregateId: crypto.randomUUID(),
      eventType: 'test.entity.happened',
      eventVersion: 1,
      payload: {} as P,
      ...over,
    };
  },
};
