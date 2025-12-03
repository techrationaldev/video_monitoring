import ffmpeg from 'fluent-ffmpeg';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface RecordingOptions {
  roomId: string;
  sdp: string; // SDP content as string
  outputPath: string;
}

export class FFmpegRecorder {
  private command: ffmpeg.FfmpegCommand | null = null;
  private isRecording: boolean = false;
  private process: any = null;

  constructor() {}

  async start(options: RecordingOptions): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    const { roomId, sdp, outputPath } = options;

    // Write SDP to a temporary file
    const tempDir = os.tmpdir();
    const sdpPath = path.join(tempDir, `${roomId}.sdp`);
    fs.writeFileSync(sdpPath, sdp);

    logger.info(`Starting FFmpeg for room ${roomId}, output: ${outputPath}`);

    return new Promise((resolve, reject) => {
        // Construct FFmpeg command
        // ffmpeg -protocol_whitelist "file,udp,rtp" -i input.sdp -c:v copy -c:a aac output.mp4

        this.command = ffmpeg()
            .input(sdpPath)
            .inputOptions([
                '-protocol_whitelist', 'file,udp,rtp'
            ])
            .outputOptions([
                '-c:v', 'copy', // Copy video stream (no transcoding) if compatible
                '-c:a', 'aac'   // Transcode audio to AAC (often needed for mp4)
            ])
            .output(outputPath)
            .on('start', (commandLine) => {
                logger.info(`FFmpeg process started: ${commandLine}`);
                this.isRecording = true;
                resolve();
            })
            .on('error', (err, stdout, stderr) => {
                logger.error(`FFmpeg error: ${err.message}`);
                logger.error(`FFmpeg stderr: ${stderr}`);
                this.isRecording = false;

                // If the promise hasn't settled yet (startup failure), reject it
                // We can check if isRecording was set to true in 'start' event,
                // but since 'start' usually fires before 'error' if the process spawned,
                // we might need a flag indicating if we already resolved.
                // However, fluent-ffmpeg 'error' can fire if spawn fails.
                // A simple heuristic is: if we haven't resolved yet, reject.
                // But we can't easily know promise state.
                // Instead, we can rely on the fact that if 'start' happened, we resolved.
                // But 'start' is synchronous here.

                // Better approach: Since 'start' event resolves the promise, if we get error and haven't started, we reject.
                // Note: 'start' event fires when the process is spawned.

                reject(new Error(`FFmpeg failed to start: ${err.message}`));
            })
            .on('end', () => {
                logger.info(`FFmpeg process ended for room ${roomId}`);
                this.isRecording = false;
                // Clean up SDP file
                if (fs.existsSync(sdpPath)) {
                    fs.unlinkSync(sdpPath);
                }
            });

        this.process = this.command.run();
    });
  }

  async stop(): Promise<void> {
    if (!this.isRecording || !this.command) {
      logger.warn('Stop called but no recording in progress');
      return;
    }

    logger.info('Stopping FFmpeg process...');

    return new Promise((resolve) => {
        if (this.command) {
            this.command.on('end', () => {
                resolve();
            });

            // Send SIGINT or SIGTERM to stop gracefully
            this.command.kill('SIGINT');
        } else {
            resolve();
        }
    });
  }

  get isActive(): boolean {
      return this.isRecording;
  }
}
