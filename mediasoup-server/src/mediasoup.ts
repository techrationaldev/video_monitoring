import * as mediasoup from "mediasoup";
import { types } from "mediasoup";
import { config } from "./config.js";

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
