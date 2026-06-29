import { HttpResponse, http } from 'msw';
import { makeGroup } from './fixtures';

export const groupsHandlers = {
  empty: http.get('*/api/planner/v1/groups/mine', () => HttpResponse.json({ groups: [] })),
  threeUp: http.get('*/api/planner/v1/groups/mine', () =>
    HttpResponse.json({
      groups: [
        makeGroup(),
        makeGroup({ id: 'g2', name: 'Marketing' }),
        makeGroup({ id: 'g3', name: 'Ops' }),
      ],
    }),
  ),
  error: http.get('*/api/planner/v1/groups/mine', () =>
    HttpResponse.json({ error: 'SERVER' }, { status: 500 }),
  ),
};
