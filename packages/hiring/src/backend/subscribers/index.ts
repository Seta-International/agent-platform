import type { SubscriberDef } from '@seta/shared-types';
import { hiringSkillRenamed } from './skill-renamed.ts';

export function hiringSubscribers(): SubscriberDef[] {
  return [hiringSkillRenamed];
}
