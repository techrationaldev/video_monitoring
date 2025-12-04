import express from "express";
import bodyParser from "body-parser";
import { rooms } from "./rooms.js";
import { config } from "./config.js";
import { generateSDP } from "./sdpUtils.js";

const app = express();
app.use(bodyParser.json());

// Auth middleware
const checkAuth = (req: any, res: any, next: any) => {
  const secret = req.headers["authorization"];
  if (secret !== `Bearer ${config.internalApiSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

app.post("/create-recording-transport", checkAuth, async (req, res) => {
  const { roomId, recordingIp, audioPort, videoPort } = req.body;

  if (!roomId || !recordingIp) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  try {
    // Create PlainTransports for recording (one per stream)
    const transports = await room.createRecordingTransportTuple(
      recordingIp,
      audioPort,
      videoPort
    );

    const producers = room.getProducers();
    const audioProducer = producers.find((p) => p.kind === "audio");
    const videoProducer = producers.find((p) => p.kind === "video");

    // We assume we are consuming existing producers.
    // Get codec details from producers or router capabilities

    const audioCodec =
      audioProducer && (audioProducer as any).rtpParameters
        ? {
            payloadType: (audioProducer as any).rtpParameters.codecs[0]
              .payloadType,
            mimeType: (audioProducer as any).rtpParameters.codecs[0].mimeType,
            clockRate: (audioProducer as any).rtpParameters.codecs[0].clockRate,
            channels: (audioProducer as any).rtpParameters.codecs[0].channels,
          }
        : null;

    const videoCodec =
      videoProducer && (videoProducer as any).rtpParameters
        ? {
            payloadType: (videoProducer as any).rtpParameters.codecs[0]
              .payloadType,
            mimeType: (videoProducer as any).rtpParameters.codecs[0].mimeType,
            clockRate: (videoProducer as any).rtpParameters.codecs[0].clockRate,
          }
        : null;

    const sdp = generateSDP(
      recordingIp,
      audioPort,
      videoPort,
      audioCodec,
      videoCodec
    );

    // We return the first transport ID just as a handle, but technically we have multiple.
    // For 'close', we call closeRecordingTransports which cleans all.
    const mainTransport =
      transports.length > 0 ? transports[0].transport.id : "none";

    res.json({
      transportId: mainTransport,
      sdp,
    });
  } catch (error: any) {
    console.error("Error creating recording transport:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/close-recording-transport", checkAuth, async (req, res) => {
  const { roomId } = req.body; // In real implementation, we might need transportId too
  // For simplicity, we assume one recording per room or handle it in Room class
  const room = rooms.get(roomId);
  if (room) {
    room.closeRecordingTransports();
  }
  res.json({ success: true });
});

export const apiServer = app;
