interface Assignee {
  user_id: string;
  display_name: string;
}

interface Props {
  assignees: ReadonlyArray<Assignee>;
  max?: number;
}

function initialsOf(name: string): string {
  const initials: string[] = [];
  for (const p of name.split(/\s+/)) {
    if (p && initials.length < 2) initials.push(p.charAt(0));
  }
  return initials.join('').toUpperCase();
}

function hueFromUserId(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function pastelStyle(userId: string): { background: string; color: string; border: string } {
  const hue = hueFromUserId(userId);
  return {
    background: `hsl(${hue} 60% 88%)`,
    color: `hsl(${hue} 40% 22%)`,
    border: `1px solid hsl(${hue} 50% 75%)`,
  };
}

export function AvatarStack({ assignees, max = 3 }: Props) {
  const shown = assignees.slice(0, max);
  const overflow = assignees.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((a) => (
        <span
          key={a.user_id}
          className="avatar-stack__avatar"
          title={a.display_name}
          style={pastelStyle(a.user_id)}
        >
          {initialsOf(a.display_name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="avatar-stack__avatar avatar-stack__avatar--more"
          title={`+${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
