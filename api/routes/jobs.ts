/**
 * AgentGuard — Async Evaluation Job Queue Routes (M3-79)
 *
 * POST /api/v1/evaluations/async     — submit async evaluation
 * GET  /api/v1/evaluations/jobs/:id  — get job status + result
 * GET  /api/v1/evaluations/jobs      — list jobs for tenant
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { IDatabase } from '../db-interface.js';
import type { AuthMiddleware } from '../middleware/auth.js';

const AsyncEvalSchema = z.object({
  agentId: z.string().optional(),
  toolName: z.string(),
  toolInput: z.record(z.string(), z.unknown()),
  context: z.record(z.string(), z.unknown()).optional(),
});

export function createJobRoutes(db: IDatabase, auth: AuthMiddleware): Router {
  const router = Router();

  // Submit async evaluation
  router.post(
    '/api/v1/evaluations/async',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      const parsed = AsyncEvalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]!.message });
      }

      try {
        const tenantId = req.tenantId!;
        const jobId = await db.enqueueJob(tenantId, 'evaluation', JSON.stringify(parsed.data));
        res.status(202).json({
          jobId,
          status: 'pending',
          pollUrl: `/api/v1/evaluations/jobs/${jobId}`,
        });
      } catch (e) {
        console.error('[jobs/submit]', e);
        res.status(500).json({ error: 'Failed to enqueue evaluation' });
      }
    },
  );

  // Get job status
  router.get(
    '/api/v1/evaluations/jobs/:jobId',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      try {
        const job = await db.getJob(req.params.jobId);
        if (!job || job.tenant_id !== req.tenantId) {
          return res.status(404).json({ error: 'Job not found' });
        }

        const response: Record<string, unknown> = {
          jobId: job.id,
          status: job.status,
          jobType: job.job_type,
          createdAt: job.created_at,
          startedAt: job.started_at,
          completedAt: job.completed_at,
        };

        if (job.status === 'completed' && job.result) {
          response.result = JSON.parse(job.result);
        }
        if (job.status === 'failed' && job.error) {
          response.error = job.error;
        }

        res.json(response);
      } catch (e) {
        console.error('[jobs/status]', e);
        res.status(500).json({ error: 'Failed to fetch job' });
      }
    },
  );

  // List jobs
  router.get(
    '/api/v1/evaluations/jobs',
    auth.requireTenantAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenantId!;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const offset = Number(req.query.offset) || 0;
        const jobs = await db.getJobsForTenant(tenantId, limit, offset);

        res.json({
          jobs: jobs.map((j) => ({
            jobId: j.id,
            status: j.status,
            jobType: j.job_type,
            createdAt: j.created_at,
            completedAt: j.completed_at,
          })),
          pagination: { limit, offset, count: jobs.length },
        });
      } catch (e) {
        console.error('[jobs/list]', e);
        res.status(500).json({ error: 'Failed to list jobs' });
      }
    },
  );

  return router;
}
