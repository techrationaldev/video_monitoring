import ffmpeg from "fluent-ffmpeg";
import logger from "../utils/logger";
import fs from "fs";
import path from "path";
import os from "os";

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
      throw new Error("Recording already in progress");
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
          "-protocol_whitelist",
          "file,udp,rtp",
          "-loglevel",
          "debug",
        ])
        .outputOptions([
          "-map", "0", // Map all streams from input 0
          "-c:v",
          "libx264", // Transcode to H.264
          "-preset",
          "ultrafast", // Low latency
          "-analyzeduration",
          "100M",
          "-probesize",
          "100M",
          "-tune",
          "zerolatency",
          "-c:a",
          "aac", // Transcode audio to AAC
          "-movflags",
          "+frag_keyframe+empty_moov+default_base_moof", // Fragmented MP4 for immediate writing
        ])
        .output(outputPath)
        .on("start", (commandLine) => {
          logger.info(`FFmpeg process started: ${commandLine}`);
          this.isRecording = true;
          resolve();
        })
        .on("error", (err, stdout, stderr) => {
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
        .on("end", () => {
          logger.info(`FFmpeg process ended for room ${roomId}`);
          this.isRecording = false;
          // Clean up SDP file
          if (fs.existsSync(sdpPath)) {
            fs.unlinkSync(sdpPath);
          }
        });

      this.process = this.command.run();

      // Log file size periodically
      const sizeInterval = setInterval(() => {
        if (this.isRecording && fs.existsSync(outputPath)) {
          const stats = fs.statSync(outputPath);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          logger.info(`[FFmpeg] Recording size: ${sizeMB} MB`);
        }
      }, 5000);

      this.command.on("end", () => clearInterval(sizeInterval));
      this.command.on("error", () => clearInterval(sizeInterval));
    });
  }

  async stop(): Promise<void> {
    if (!this.isRecording || !this.command) {
      logger.warn("Stop called but no recording in progress");
      return;
    }

    logger.info("Stopping FFmpeg process...");

    return new Promise((resolve) => {
      if (this.command) {
        const timeout = setTimeout(() => {
          logger.warn("FFmpeg did not exit in time, force killing...");
          if (this.command) {
            this.command.kill("SIGKILL");
          }
          resolve();
        }, 2000);

        this.command.on("end", () => {
          clearTimeout(timeout);
          resolve();
        });

        this.command.on("error", () => {
          clearTimeout(timeout);
          resolve();
        });

        // Send SIGINT to stop gracefully first
        this.command.kill("SIGINT");
      } else {
        resolve();
      }
    });
  }

  get isActive(): boolean {
    return this.isRecording;
  }
}
