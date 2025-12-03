import { Router, Request, Response, NextFunction } from 'express';
import { RecordingController } from '../controllers/recording.controller';
import logger from '../utils/logger';

const router = Router();

// Middleware to check INTERNAL_API_SECRET
const checkAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const secret = process.env.INTERNAL_API_SECRET;

  if (!secret) {
      logger.error('INTERNAL_API_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!authHeader || authHeader !== `Bearer ${secret}`) {
      logger.warn(`Unauthorized access attempt from ${req.ip}`);
      return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

// Apply auth middleware to all routes
router.use(checkAuth);

router.post('/start', RecordingController.start);
router.post('/stop', RecordingController.stop);
router.get('/status/:roomId', RecordingController.status);

export default router;
