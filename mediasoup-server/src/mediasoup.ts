import * as mediasoup from "mediasoup";
import { types } from "mediasoup";
import { config } from "./config.js";

/**
 * Creates and initializes a Mediasoup worker and router.
 * Configures media codecs (audio/opus, video/H264).
 *
 * @returns {Promise<{worker: types.Worker, router: types.Router}>} An object containing the created worker and router.
 */
export async function createMediasoupWorker() {
  const worker = await mediasoup.createWorker({
    rtcMinPort: config.rtcMinPort,
    rtcMaxPort: config.rtcMaxPort,
  });

  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters: {
          "packetization-mode": 1,
          "level-asymmetry-allowed": 1,
        },
      },
    ],
  });

  return { worker, router };
}

/**
 * Creates a WebRTC transport on the given router.
 * Configures listen IPs and enables UDP/TCP.
 *
 * @param {types.Router} router - The Mediasoup router instance.
 * @returns {Promise<types.WebRtcTransport>} The created WebRTC transport.
 */
export async function createWebRtcTransport(
  router: types.Router
): Promise<types.WebRtcTransport> {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: config.listenIp, announcedIp: config.announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  return transport;
}
