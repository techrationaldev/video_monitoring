import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Configuration object for the Mediasoup server.
 * Loads environment variables or falls back to default values.
 *
 * @property {string} listenIp - The IP address the server listens on (default: "0.0.0.0").
 * @property {string} announcedIp - The public IP address announced to clients (default: "127.0.0.1").
 * @property {number} serverPort - The port for the WebSocket server (default: 5005).
 * @property {number} rtcMinPort - Minimum port for RTC connections (default: 40000).
 * @property {number} rtcMaxPort - Maximum port for RTC connections (default: 49999).
 * @property {string} turnHostname - Hostname for the TURN server.
 * @property {string} turnUsername - Username for TURN authentication.
 * @property {string} turnPassword - Password for TURN authentication.
 * @property {string} laravelApiUrl - URL of the Laravel backend API.
 * @property {string} internalApiSecret - Secret key for internal API communication with Laravel.
 * @property {string} recordingServiceUrl - URL of the Recording Service (default: "http://localhost:4000").
 */
export const config = {
  listenIp: process.env.LISTEN_IP || "0.0.0.0",
  announcedIp: process.env.ANNOUNCED_IP || "127.0.0.1",
  serverPort: parseInt(process.env.SERVER_PORT || "5005"),
  rtcMinPort: parseInt(process.env.RTC_MIN_PORT || "40000"),
  rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || "49999"),
  turnHostname: process.env.TURN_HOSTNAME || "turn.mytro.in",
  turnUsername: process.env.TURN_USERNAME || "user",
  turnPassword: process.env.TURN_PASSWORD || "pass",
  laravelApiUrl: process.env.LARAVEL_API_URL || "http://127.0.0.1:8000/api",
  internalApiSecret: process.env.INTERNAL_API_SECRET || "",
  recordingServiceUrl:
    process.env.RECORDING_SERVICE_URL || "http://localhost:4000",
} as const;
