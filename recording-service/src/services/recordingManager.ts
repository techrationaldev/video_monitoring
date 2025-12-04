import { FFmpegRecorder } from "./ffmpegRecorder";
import { getStorageService, IStorageService } from "./storageService";
import { LaravelNotifier } from "./notifyLaravel";
import { MediasoupConnector } from "./mediasoupConnector";
import logger from "../utils/logger";
import { getFreeUdpPort } from "../utils/portFinder";
import path from "path";
import fs from "fs";

interface RecordingSession {
  recorder: FFmpegRecorder;
  startTime: number;
  outputPath: string;
}

export class RecordingManager {
  private sessions: Map<string, RecordingSession> = new Map();
  private pendingRooms: Set<string> = new Set();
  private storageService: IStorageService;
  private notifier: LaravelNotifier;
  private mediasoupConnector: MediasoupConnector;
  private localRecordingsDir: string;

  constructor() {
    this.storageService = getStorageService();
    this.notifier = new LaravelNotifier();
    this.mediasoupConnector = new MediasoupConnector();
    this.localRecordingsDir = path.resolve(
      process.env.LOCAL_RECORDING_TEMP_PATH || "recordings/temp"
    );

    if (!fs.existsSync(this.localRecordingsDir)) {
      fs.mkdirSync(this.localRecordingsDir, { recursive: true });
    }
  }

  async startRecording(roomId: string): Promise<void> {
    logger.info(`[RecordingManager] Entering startRecording for room ${roomId}`);
    if (this.sessions.has(roomId) || this.pendingRooms.has(roomId)) {
      throw new Error(`Recording already active or pending for room ${roomId}`);
    }

    this.pendingRooms.add(roomId);

    // Track recorder locally to ensure cleanup on error
    let recorder: FFmpegRecorder | null = null;

    try {
      // 1. Find free UDP ports for Audio and Video
      const audioPort = await getFreeUdpPort();
      const videoPort = await getFreeUdpPort();
      const recordingIp = "127.0.0.1"; // Ideally detect own IP or read from config

      logger.info(`[RecordingManager] Allocated ports for room ${roomId}: Audio=${audioPort}, Video=${videoPort}`);

      // 2. Get SDP/Connection info from Mediasoup (Consumers are PAUSED initially)
      // We pass our ports so Mediasoup can connect to them (Push model)
      logger.info(`[RecordingManager] Requesting Mediasoup transport for room ${roomId}...`);
      const { sdp } = await this.mediasoupConnector.startRecordingTransport(
        roomId,
        recordingIp,
        audioPort,
        videoPort
      );
      logger.info(`[RecordingManager] Received SDP from Mediasoup for room ${roomId}. SDP Length: ${sdp.length}`);

      // 3. Prepare output path
      const filename = `${roomId}_${Date.now()}.mp4`;
      const outputPath = path.join(this.localRecordingsDir, filename);

      // 4. Start FFmpeg (Starts listening on ports)
      logger.info(`[RecordingManager] Starting FFmpeg process for room ${roomId}...`);
      recorder = new FFmpegRecorder();
      await recorder.start({
        roomId,
        sdp,
        outputPath,
      });

      // Wait a moment for FFmpeg to initialize and bind UDP ports
      logger.info(`[RecordingManager] FFmpeg started. Waiting 1000ms for socket binding...`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 5. Resume Mediasoup Consumers (Trigger KeyFrame now that FFmpeg is ready)
      logger.info(`[RecordingManager] Resuming Mediasoup consumers for room ${roomId}...`);
      await this.mediasoupConnector.resumeRecording(roomId);

      // 6. Store session
      this.sessions.set(roomId, {
        recorder,
        startTime: Date.now(),
        outputPath,
      });

      logger.info(`[RecordingManager] Mediasoup consumers resumed. Recording setup complete for room ${roomId}`);
    } catch (error: any) {
      logger.error(
        `Error starting recording for room ${roomId}: ${error.message}`
      );

      // Cleanup if needed (stop ffmpeg if started)
      if (recorder && recorder.isActive) {
        logger.info(`[RecordingManager] Stopping orphan FFmpeg process for room ${roomId}...`);
        try {
          await recorder.stop();
        } catch (cleanupError: any) {
          logger.error(`[RecordingManager] Failed to stop orphan FFmpeg: ${cleanupError.message}`);
        }
      }

      await this.notifier.notifyRecordingFailed(roomId, error.message);
      throw error;
    } finally {
      this.pendingRooms.delete(roomId);
    }
  }

  async stopRecording(roomId: string): Promise<void> {
    logger.info(`[RecordingManager] Entering stopRecording for room ${roomId}`);
    const session = this.sessions.get(roomId);
    if (!session) {
      throw new Error(`No active recording for room ${roomId}`);
    }

    try {
      // 1. Stop FFmpeg
      logger.info(`[RecordingManager] Stopping FFmpeg for room ${roomId}...`);
      await session.recorder.stop();
      logger.info(`[RecordingManager] FFmpeg stopped for room ${roomId}`);

      // 2. Stop Mediasoup Transport
      logger.info(`[RecordingManager] Closing Mediasoup transport for room ${roomId}...`);
      await this.mediasoupConnector.stopRecordingTransport(roomId);

      // 3. Calculate stats
      const duration = (Date.now() - session.startTime) / 1000;
      let size = 0;
      if (fs.existsSync(session.outputPath)) {
          const stats = fs.statSync(session.outputPath);
          size = stats.size;
      }
      logger.info(`[RecordingManager] Processing file stats for room ${roomId}: Duration=${duration}s, Size=${size} bytes`);

      // 4. Upload/Move file
      const filename = path.basename(session.outputPath);
      logger.info(`[RecordingManager] Uploading file for room ${roomId}...`);
      const finalPath = await this.storageService.uploadFile(
        session.outputPath,
        filename
      );
      logger.info(`[RecordingManager] File uploaded to ${finalPath}`);

      // 5. Notify Laravel (Don't fail the whole stop process if this fails)
      try {
        logger.info(`[RecordingManager] Notifying backend for room ${roomId}...`);
        await this.notifier.notifyRecordingComplete(
          roomId,
          finalPath,
          duration,
          size
        );
        logger.info(`[RecordingManager] Backend notified for room ${roomId}`);
      } catch (notifyError: any) {
        logger.error(
          `Failed to notify Laravel backend: ${notifyError.message}`
        );
      }

      // 6. Cleanup
      this.sessions.delete(roomId);
      logger.info(
        `[RecordingManager] Recording stopped for room ${roomId}. Cleanup complete.`
      );
    } catch (error: any) {
      logger.error(
        `Error stopping recording for room ${roomId}: ${error.message}`
      );
      // Even if upload fails, we should try to notify or cleanup
      throw error;
    }
  }

  getRecordingStatus(roomId: string) {
    const session = this.sessions.get(roomId);
    if (!session) {
      return { status: "idle" };
    }
    return {
      status: "recording",
      startTime: new Date(session.startTime).toISOString(),
      duration: (Date.now() - session.startTime) / 1000,
    };
  }
}
