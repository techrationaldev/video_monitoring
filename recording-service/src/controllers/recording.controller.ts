import { Request, Response } from 'express';
import { RecordingManager } from '../services/recordingManager';
import logger from '../utils/logger';

const recordingManager = new RecordingManager();

export class RecordingController {
  static async start(req: Request, res: Response) {
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    try {
      await recordingManager.startRecording(roomId);
      return res.status(200).json({ message: 'Recording started', roomId });
    } catch (error: any) {
      logger.error(`Start recording failed: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }

  static async stop(req: Request, res: Response) {
    const { roomId } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    try {
      await recordingManager.stopRecording(roomId);
      return res.status(200).json({ message: 'Recording stopped', roomId });
    } catch (error: any) {
      logger.error(`Stop recording failed: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
  }

  static async status(req: Request, res: Response) {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    const status = recordingManager.getRecordingStatus(roomId);
    return res.status(200).json(status);
  }
}
