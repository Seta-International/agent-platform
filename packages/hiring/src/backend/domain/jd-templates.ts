import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import type { JdTemplateInput } from '../../contracts.ts';
import { hiringDb } from '../db/client.ts';
import { jdTemplate, jdTemplateSection } from '../db/schema.ts';
import { tenantScoped } from '../db/scope.ts';
import { HiringError, requirePermission } from '../rbac.ts';

export async function createJdTemplate(input: {
  input: JdTemplateInput;
  session: SessionScope;
}): Promise<{ template_id: string }> {
  const { session } = input;
  requirePermission(session, 'hiring.jd_template.manage');
  return hiringDb().transaction(async (tx) => {
    const [tpl] = await tx
      .insert(jdTemplate)
      .values({ tenant_id: session.tenant_id, name: input.input.name, kind: input.input.kind })
      .returning({ id: jdTemplate.id });
    if (!tpl) throw new Error('jd_template insert returned no row');
    if (input.input.sections.length) {
      await tx.insert(jdTemplateSection).values(
        input.input.sections.map((s) => ({
          tenant_id: session.tenant_id,
          template_id: tpl.id,
          variant: s.variant,
          section: s.section,
          body: s.body,
        })),
      );
    }
    return { template_id: tpl.id };
  });
}

export async function listJdTemplates(session: SessionScope) {
  requirePermission(session, 'hiring.jd_template.read');
  const templates = await hiringDb()
    .select()
    .from(jdTemplate)
    .where(tenantScoped(jdTemplate.tenant_id, session));
  const sections = await hiringDb()
    .select()
    .from(jdTemplateSection)
    .where(tenantScoped(jdTemplateSection.tenant_id, session));
  return templates.map((template) => ({
    template,
    sections: sections.filter((s) => s.template_id === template.id),
  }));
}

export async function deleteJdTemplate(input: {
  template_id: string;
  session: SessionScope;
}): Promise<void> {
  const { session, template_id } = input;
  requirePermission(session, 'hiring.jd_template.manage');
  await hiringDb().transaction(async (tx) => {
    const [deleted] = await tx
      .delete(jdTemplate)
      .where(and(eq(jdTemplate.id, template_id), tenantScoped(jdTemplate.tenant_id, session)))
      .returning({ id: jdTemplate.id });
    if (!deleted) throw new HiringError('NOT_FOUND', 'template not found');
    await tx.delete(jdTemplateSection).where(eq(jdTemplateSection.template_id, template_id));
  });
}
