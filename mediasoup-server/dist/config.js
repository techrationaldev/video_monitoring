import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
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
};
