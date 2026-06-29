import { buildActorSession, listUsers } from '@seta/identity';
import { getPersonSkills, matchUsersToTopic, readPresence } from '@seta/people';
import { getTask, listDistinctLabels, listTasks, listTasksByLabel } from '@seta/planner';
import type {
  AvailabilityPort,
  SkillSearchPort,
  TaskReaderPort,
  TaskSearchPort,
  UserProfilePort,
} from './ports.ts';

// ---- TaskReader: planner.getTask under an actor session ----
export function makeTaskReader(): TaskReaderPort {
  return {
    async load(taskId, ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      try {
        const t = await getTask({ task_id: taskId, session });
        return {
          taskId: t.id,
          title: t.title,
          description: t.description ?? null,
          // TaskDetailRow carries plan_id, not a group id, and the pipeline never
          // reads groupId (the analyzer only uses title/description/labels). Left
          // blank rather than firing a second query for an unused field.
          groupId: '',
          labels: t.labels.map((l) => l.name),
        };
      } catch {
        return null;
      }
    },
  };
}

// ---- TaskSearch: planner.listTasksByLabel (deterministic, case-insensitive) ----
const TASK_SEARCH_DEFAULT_LIMIT = 20;

export function makeTaskSearch(): TaskSearchPort {
  return {
    async byLabels(names, limit, ctx, completionStatus) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      const { results } = await listTasksByLabel({
        names,
        completionStatus,
        // Clamp to the domain function's 1..50 contract; default 20 when unset.
        limit: Math.min(Math.max(limit || TASK_SEARCH_DEFAULT_LIMIT, 1), 50),
        session,
      });
      return results.map((r) => ({
        taskId: r.taskId,
        title: r.title,
        status: r.status,
        labels: r.labels,
      }));
    },
    async listAvailableLabels(ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      return listDistinctLabels({ session });
    },
  };
}

// ---- SkillSearch: people.matchUsersToTopic (vector) ----
// provider + pgVector are the embedding provider + the People person-profile
// PgVector (people_rag), injected by apps/server. matchUsersToTopic queries the
// People vector index and hydrates display fields via a worker join.
export interface SkillSearchDeps {
  provider: Parameters<typeof matchUsersToTopic>[1]['provider'];
  pgVector: Parameters<typeof matchUsersToTopic>[1]['pgVector'];
}

export function makeSkillSearch(deps: SkillSearchDeps): SkillSearchPort {
  return {
    async search({ skills, topK }, ctx) {
      // Match the profile embedding format from buildPersonProfileSource so cosine
      // similarity is computed between semantically aligned texts. A bare
      // skills.join(', ') query scores <0.2 against the rich profile paragraphs.
      const topic = skills.length === 0 ? '' : `Core competencies include ${skills.join(', ')}.`;
      const hits = await matchUsersToTopic(
        { topic, tenant_id: ctx.tenantId, limit: topK, minScore: 0.3 },
        { provider: deps.provider, pgVector: deps.pgVector },
      );
      return hits.map((h) => ({
        userId: h.item.user_id,
        name: h.item.display_name || null,
        skills: h.item.skills,
        role: null,
        similarity: h.score,
      }));
    },
  };
}

// ---- UserProfileLookup: identity listUsers (name search) + getUserProfile ----
const PROFILE_LOOKUP_DEFAULT_LIMIT = 5;

export function makeUserProfileLookup(): UserProfilePort {
  return {
    async findByName(name, ctx, limit) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      const { rows } = await listUsers(ctx.tenantId, {
        search: name,
        limit: Math.min(Math.max(limit ?? PROFILE_LOOKUP_DEFAULT_LIMIT, 1), 25),
        offset: 0,
      });
      // role is no longer modeled per-user (job role lives on People worker.job_title,
      // which the recommender doesn't consume); skills + availability come from People.
      const profiles = await Promise.all(
        rows.map(async (r) => {
          const [presence, skills] = await Promise.all([
            readPresence(session, { user_id: r.user_id }),
            getPersonSkills(session, { user_id: r.user_id }),
          ]);
          return {
            userId: r.user_id,
            name: r.name,
            role: null,
            skills,
            availability: presence.availability_status,
          };
        }),
      );
      return profiles;
    },
  };
}

// ---- Availability: real in-progress count; leave is Phase-A default ----
export function makeAvailability(): AvailabilityPort {
  return {
    // Availability from People presence (worker), read under the actor's session.
    // name is left to the candidate-level fallback (avai-checker uses s.name ?? c.name).
    async status(userId, ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      const presence = await readPresence(session, { user_id: userId });
      return {
        status: presence.availability_status,
        name: null,
        note: null,
      };
    },
    async inProgressCount(userId, ctx) {
      const session = await buildActorSession({ user_id: ctx.actorUserId });
      // "In progress" = the MS-Planner mid bucket: started but not complete.
      // percent_complete is an int (0 not started / 50 in progress / 100 done),
      // so gte:1 && lt:100 selects active work assigned to this user.
      const { tasks } = await listTasks({
        session,
        filters: { assignee_id: userId, percent_complete_gte: 1, percent_complete_lt: 100 },
        limit: 200,
      });
      return tasks.length;
    },
  };
}
