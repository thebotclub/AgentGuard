/**
 * AgentGuard — Prometheus Metrics Endpoint
 *
 * GET /metrics — returns metrics in Prometheus exposition format.
 * No authentication required (standard for /metrics).
 */
import { Router, type Request, type Response } from 'express';
import { metrics } from '../lib/metrics.js';

export function createMetricsRoutes(): Router {
  const router = Router();

  router.get('/metrics', (_req: Request, res: Response) => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics.toPrometheusFormat());
  });

  return router;
}
