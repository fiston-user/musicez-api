import { Router, Request, Response } from 'express';
import { config } from '../config/environment';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: config.app.name,
    version: config.app.version,
    description: 'AI-powered music recommendation API',
    documentation: '/api-docs',
    health: '/health',
  });
});

export { router as rootRouter };