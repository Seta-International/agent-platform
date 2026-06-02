import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it } from 'vitest';
import { makeTaskAnalyzerTools } from '../../../../src/backend/orchestration/agents/task-analyzer.tools.ts';
import type {
  TaskReaderPort,
  TaskSearchPort,
} from '../../../../src/backend/orchestration/ports.ts';

function ctx() {
  const rc = new RequestContext();
  rc.set('tenant_id', 't1');
  rc.set('actor', { type: 'user', user_id: 'a1' });
  return { requestContext: rc } as never;
}

const taskReader: TaskReaderPort = {
  async load(taskId, runCtx) {
    expect(runCtx.tenantId).toBe('t1'); // tenant flows from requestContext
    return {
      taskId,
      title: 'AWS migration',
      description: 'lift and shift',
      groupId: 'g',
      skillTags: ['aws'],
    };
  },
};
const taskSearch: TaskSearchPort = {
  async bySkillTags(tags, limit, runCtx) {
    expect(runCtx.tenantId).toBe('t1');
    expect(limit).toBe(20);
    return [{ taskId: 't9', title: 'Infra A', status: 'not_started', skillTags: tags }];
  },
};

const deps = {
  taskReader,
  taskSearch,
  resolveModel: () => ({}) as never,
  extractSkillsFromTask: async () => ['terraform', 'aws'],
  extractTagsFromQuery: async () => ['infrastructure'],
};

describe('task-analyzer tools', () => {
  it('fetchTaskData maps the task and marks found', async () => {
    const { fetchTaskData } = makeTaskAnalyzerTools(deps);
    const out = (await fetchTaskData.execute!({ taskId: 't1' } as never, ctx())) as {
      skillTags: string[];
      found: boolean;
    };
    expect(out.found).toBe(true);
    expect(out.skillTags).toEqual(['aws']);
  });

  it('findTaskBySkillTag returns tasks via the port (default limit 20)', async () => {
    const { findTaskBySkillTag } = makeTaskAnalyzerTools(deps);
    const out = (await findTaskBySkillTag.execute!(
      { tags: ['infrastructure'] } as never,
      ctx(),
    )) as {
      tasks: { taskId: string }[];
    };
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]?.taskId).toBe('t9');
  });

  it('extractRequirement returns skills via the seam', async () => {
    const { extractRequirement } = makeTaskAnalyzerTools(deps);
    const out = (await extractRequirement.execute!(
      { title: 'x', description: 'y' } as never,
      ctx(),
    )) as { skills: string[] };
    expect(out.skills).toEqual(['terraform', 'aws']);
  });

  it('extractSkillTag returns tags via the seam', async () => {
    const { extractSkillTag } = makeTaskAnalyzerTools(deps);
    const out = (await extractSkillTag.execute!({ query: 'find infra tasks' } as never, ctx())) as {
      tags: string[];
    };
    expect(out.tags).toEqual(['infrastructure']);
  });
});
