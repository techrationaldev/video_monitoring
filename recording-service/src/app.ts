import express from 'express';
import helmet from 'helmet';
import recordingRoutes from './routes/recording.routes';
import logger from './utils/logger';

const app = express();

app.use(helmet());
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/recording', recordingRoutes);

// Health check (no auth required)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
});

export default app;
