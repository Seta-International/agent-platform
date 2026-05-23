import type { StreamHubBuilder } from '@seta/core';
import { BoardStreamHub } from './hub.ts';

export { BoardStreamHub } from './hub.ts';

export const buildPlannerBoardStreamHub: StreamHubBuilder = () => {
  const hub = new BoardStreamHub();
  return {
    start: () => hub.start(),
    stop: () => hub.stop(),
    hub,
  };
};
