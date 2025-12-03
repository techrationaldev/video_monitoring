import { FFmpegRecorder } from './ffmpegRecorder';
import { getStorageService, IStorageService } from './storageService';
import { LaravelNotifier } from './notifyLaravel';
import { MediasoupConnector } from './mediasoupConnector';
import logger from '../utils/logger';
import { getFreeUdpPort } from '../utils/portFinder';
import path from 'path';
import fs from 'fs';

interface RecordingSession {
  recorder: FFmpegRecorder;
  startTime: number;
  outputPath: string;
}

export class RecordingManager {
  private sessions: Map<string, RecordingSession> = new Map();
  private storageService: IStorageService;
  private notifier: LaravelNotifier;
  private mediasoupConnector: MediasoupConnector;
  private localRecordingsDir: string;

  constructor() {
    this.storageService = getStorageService();
    this.notifier = new LaravelNotifier();
    this.mediasoupConnector = new MediasoupConnector();
    this.localRecordingsDir = path.resolve(process.env.LOCAL_RECORDING_TEMP_PATH || 'recordings/temp');

    if (!fs.existsSync(this.localRecordingsDir)) {
      fs.mkdirSync(this.localRecordingsDir, { recursive: true });
    }
  }

  async startRecording(roomId: string): Promise<void> {
    if (this.sessions.has(roomId)) {
      throw new Error(`Recording already active for room ${roomId}`);
    }

    try {
      // 1. Find free UDP ports for Audio and Video
      const audioPort = await getFreeUdpPort();
      const videoPort = await getFreeUdpPort();
      const recordingIp = '127.0.0.1'; // Ideally detect own IP or read from config

      // 2. Get SDP/Connection info from Mediasoup
      // We pass our ports so Mediasoup can connect to them (Push model)
      const { sdp } = await this.mediasoupConnector.startRecordingTransport(roomId, recordingIp, audioPort, videoPort);

      // 3. Prepare output path
      const filename = `${roomId}_${Date.now()}.mp4`;
      const outputPath = path.join(this.localRecordingsDir, filename);

      // 4. Start FFmpeg
      const recorder = new FFmpegRecorder();
      await recorder.start({
        roomId,
        sdp,
        outputPath
      });

      // 4. Store session
      this.sessions.set(roomId, {
        recorder,
        startTime: Date.now(),
        outputPath
      });

      logger.info(`Recording started for room ${roomId}`);

    } catch (error: any) {
      logger.error(`Error starting recording for room ${roomId}: ${error.message}`);
      await this.notifier.notifyRecordingFailed(roomId, error.message);
      throw error;
    }
  }

  async stopRecording(roomId: string): Promise<void> {
    const session = this.sessions.get(roomId);
    if (!session) {
      throw new Error(`No active recording for room ${roomId}`);
    }

    try {
      // 1. Stop FFmpeg
      await session.recorder.stop();

      // 2. Stop Mediasoup Transport
      await this.mediasoupConnector.stopRecordingTransport(roomId);

      // 3. Calculate stats
      const duration = (Date.now() - session.startTime) / 1000;
      const stats = fs.statSync(session.outputPath);
      const size = stats.size;

      // 4. Upload/Move file
      const filename = path.basename(session.outputPath);
      const finalPath = await this.storageService.uploadFile(session.outputPath, filename);

      // 5. Notify Laravel
      await this.notifier.notifyRecordingComplete(roomId, finalPath, duration, size);

      // 6. Cleanup
      this.sessions.delete(roomId);
      logger.info(`Recording stopped for room ${roomId}. Saved to ${finalPath}`);

    } catch (error: any) {
      logger.error(`Error stopping recording for room ${roomId}: ${error.message}`);
      // Even if upload fails, we should try to notify or cleanup
      throw error;
    }
  }

  getRecordingStatus(roomId: string) {
    const session = this.sessions.get(roomId);
    if (!session) {
      return { status: 'idle' };
    }
    return {
      status: 'recording',
      startTime: new Date(session.startTime).toISOString(),
      duration: (Date.now() - session.startTime) / 1000
    };
  }
}
