import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { CvParseError, type ParseCvProfileDeps } from '@seta/knowledge';
import type { Hono } from 'hono';
import {
  CV_MAX_BYTES,
  candidateCvDownloadUrl,
  parseCandidateCvDraft,
  requestCandidateCvUpload,
} from '../domain/cv.ts';

const HTTP_ALLOWED_EXTENSIONS = new Set(['pdf', 'docx']);

function cvParseErrorResponse(e: CvParseError): { status: 400 | 422 | 502; body: unknown } {
  const status = e.code === 'EMPTY_TEXT' ? 422 : e.code === 'UNSUPPORTED_TYPE' ? 400 : 502;
  return { status, body: { error: e.code, message: e.message } };
}

function resolveCvModel(
  resolveModel: NonNullable<RouteBuildDeps['resolveModel']>,
  modelKey: string | undefined,
): ParseCvProfileDeps['model'] {
  const key = modelKey?.trim();
  if (key && key !== 'auto') {
    return resolveModel({ modelKey: key }) as ParseCvProfileDeps['model'];
  }
  return resolveModel({ tierHint: 'fast' }) as ParseCvProfileDeps['model'];
}

export function registerHiringCvRoutes(
  app: Hono<SessionEnv>,
  deps: { resolveModel?: RouteBuildDeps['resolveModel'] } = {},
): void {
  // Stateless: multipart in → draft out. Nothing is written to DB or S3 here.
  app.post('/api/hiring/v1/cv/parse-draft', async (c) => {
    const session = c.get('user');
    const resolveModel = deps.resolveModel;
    if (!resolveModel) {
      return c.json({ error: 'UNAVAILABLE', message: 'model resolver not configured' }, 503);
    }
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: 'VALIDATION', message: 'multipart field "file" is required' }, 400);
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!HTTP_ALLOWED_EXTENSIONS.has(ext)) {
      return c.json({ error: 'UNSUPPORTED_TYPE', message: 'CV must be PDF or DOCX' }, 400);
    }
    if (file.size > CV_MAX_BYTES) {
      return c.json({ error: 'VALIDATION', message: 'CV exceeds the 10MB limit' }, 413);
    }
    const modelField = body.model;
    const modelKey = typeof modelField === 'string' ? modelField : undefined;
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const draft = await parseCandidateCvDraft(
        { buffer, filename: file.name, session },
        {
          resolveModel: () => resolveCvModel(resolveModel, modelKey),
        },
      );
      return c.json({ draft });
    } catch (e) {
      if (e instanceof CvParseError) {
        const { status, body: errBody } = cvParseErrorResponse(e);
        return c.json(errBody as Record<string, unknown>, status);
      }
      if (e instanceof Error && e.name === 'ModelNotFoundError') {
        return c.json({ error: 'unknown_model', message: e.message }, 400);
      }
      throw e;
    }
  });

  app.post('/api/hiring/v1/candidates/:id/cv/upload-url', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      filename?: string;
      content_type?: string;
    };
    if (!body.filename) {
      return c.json({ error: 'VALIDATION', message: 'filename is required' }, 400);
    }
    return c.json(
      await requestCandidateCvUpload({
        candidate_id: c.req.param('id'),
        filename: body.filename,
        content_type: body.content_type ?? 'application/octet-stream',
        session: c.get('user'),
      }),
    );
  });

  app.get('/api/hiring/v1/candidates/:id/cv/download-url', async (c) =>
    c.json(
      await candidateCvDownloadUrl({ candidate_id: c.req.param('id'), session: c.get('user') }),
    ),
  );
}
