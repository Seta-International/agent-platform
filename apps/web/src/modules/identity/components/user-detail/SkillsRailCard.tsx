import { Badge, Card } from '@seta/shared-ui';

export function SkillsRailCard({ skills }: { skills: string[] }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">Skills</div>
      {skills.length === 0 ? (
        <span className="text-sm text-ink-muted">No skills set</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <Badge key={s} variant="secondary">
              {s}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
