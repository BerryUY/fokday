import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { ApiRequest, ApiResponse, BackupStore, Env } from './handlers';
import { createNeonStore } from './neonStore';

export function env(): Env {
  return { token: process.env.MOMENTUM_API_TOKEN, maxBackups: Math.max(5, Number(process.env.MAX_BACKUPS) || 60) };
}

/** Thin adapter: Vercel request → pure handler → Vercel response. */
export function route(handler: (req: ApiRequest, store: BackupStore, env: Env) => Promise<ApiResponse>, idParam?: string) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const id = idParam ? String(Array.isArray(req.query[idParam]) ? req.query[idParam][0] : req.query[idParam] ?? '') : undefined;
      const out = await handler({ method: req.method ?? 'GET', headers: req.headers, body: req.body, id }, createNeonStore(process.env.DATABASE_URL), env());
      if (out.raw !== undefined) {
        res.status(out.status).setHeader('Content-Type', 'application/json; charset=utf-8').send(out.raw);
      } else {
        res.status(out.status).json(out.json ?? {});
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Error interno del servidor de respaldo.' });
    }
  };
}
