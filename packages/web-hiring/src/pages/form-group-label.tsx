import { Text } from '@seta/shared-ui';

// Quiet uppercase eyebrow that groups the requisition create/edit forms into scannable sections
// (Role, Logistics, Skills, Job description) instead of a flat run of a dozen fields. Shared so
// the New requisition dialog and the detail-view editor read as the same layout (see FUT-404).
export function GroupLabel({ children }: { children: string }) {
  return (
    <Text type="supporting" color="secondary" weight="semibold" className="uppercase">
      {children}
    </Text>
  );
}
