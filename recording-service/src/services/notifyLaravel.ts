import axios from 'axios';
import logger from '../utils/logger';

export class LaravelNotifier {
  private webhookUrl: string;
  private apiSecret: string;

  constructor() {
    this.webhookUrl = process.env.LARAVEL_WEBHOOK_URL || 'http://localhost:8000/api/recording/webhook';
    this.apiSecret = process.env.INTERNAL_API_SECRET || '';

    if (!this.webhookUrl) {
      logger.warn('LARAVEL_WEBHOOK_URL is not set. Webhooks will fail.');
    }
  }

  async notifyRecordingComplete(roomId: string, filePath: string, duration?: number, size?: number) {
    try {
      logger.info(`Notifying Laravel backend for room ${roomId}`);

      const payload = {
        event: 'recording.complete',
        roomId,
        filePath,
        duration,
        size,
        timestamp: new Date().toISOString()
      };

      await axios.post(this.webhookUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiSecret}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info(`Successfully notified Laravel for room ${roomId}`);
    } catch (error: any) {
      logger.error(`Failed to notify Laravel: ${error.message}`);
      // Depending on requirements, we might want to retry here
    }
  }

  async notifyRecordingFailed(roomId: string, error: string) {
    try {
        logger.info(`Notifying Laravel backend of failure for room ${roomId}`);

        const payload = {
            event: 'recording.failed',
            roomId,
            error,
            timestamp: new Date().toISOString()
        };

        await axios.post(this.webhookUrl, payload, {
            headers: {
                'Authorization': `Bearer ${this.apiSecret}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (err: any) {
        logger.error(`Failed to notify Laravel of failure: ${err.message}`);
    }
  }
}
