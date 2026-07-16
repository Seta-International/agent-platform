import { Avatar, AvatarGroup, AvatarGroupOverflow } from '../primitives/avatar';

interface Assignee {
  user_id: string;
  display_name: string;
}

interface Props {
  assignees: ReadonlyArray<Assignee>;
  max?: number;
}

export function AvatarStack({ assignees, max = 3 }: Props) {
  const shown = assignees.slice(0, max);
  const overflow = assignees.length - shown.length;
  return (
    <AvatarGroup size={24}>
      {shown.map((a) => (
        <Avatar key={a.user_id} name={a.display_name} />
      ))}
      {overflow > 0 && <AvatarGroupOverflow count={overflow} />}
    </AvatarGroup>
  );
}
