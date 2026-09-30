import { Router } from 'express';

import { env } from '../config/env.js';
import { dbStatus } from '../config/db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    service: 'SIH 26009 API',
    description: 'Manganese reserve identification and production shortfall prediction',
    version: '0.1.0',
    database: dbStatus(),
    links: {
      health: `${env.apiPrefix}/health`,
      weather: `${env.apiPrefix}/weather`,
    },
  });
});

export default router;
