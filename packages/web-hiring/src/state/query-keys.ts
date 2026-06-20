export const hiringKeys = {
  all: ['hiring'] as const,
  requisitions: () => [...hiringKeys.all, 'requisitions'] as const,
  requisition: (id: string) => [...hiringKeys.all, 'requisition', id] as const,
  jdTemplates: () => [...hiringKeys.all, 'jd-templates'] as const,
  closeReasons: () => [...hiringKeys.all, 'close-reasons'] as const,
};
