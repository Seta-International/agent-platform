-- hand-written: backfill creators of each group as owner; rest stay 'member' (column default)
UPDATE planner.group_members gm
SET    role = 'owner'
FROM   planner.groups g
WHERE  gm.group_id = g.id
  AND  gm.user_id  = g.created_by
  AND  gm.role     = 'member';
