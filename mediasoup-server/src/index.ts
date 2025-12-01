import * as mediasoup from "mediasoup";
import { types } from "mediasoup";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import axios from "axios";
import { rooms } from "./rooms.js";
import { config } from "./config.js";

let worker: types.Worker;
let router: types.Router;

async function setupMediasoup() {
  try {
    worker = await mediasoup.createWorker({
      rtcMinPort: config.rtcMinPort,
      rtcMaxPort: config.rtcMaxPort,
    });
    console.log("[SERVER] Mediasoup worker created");

    worker.on("died", () => {
      console.error("[SERVER] Mediasoup worker died, exiting...");
      process.exit(1);
    });

    router = await worker.createRouter({
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
            "level-asymmetry-allowed": 1,
            "packetization-mode": 1,
          },
        },
      ],
    });

    console.log("[SERVER] Mediasoup router created");
  } catch (err) {
    console.error("[SERVER] Failed to setup Mediasoup:", err);
    process.exit(1);
  }
}

await setupMediasoup();

// Reset stream statuses in DB on startup
try {
  console.log("[SERVER] Resetting stream statuses in backend...");
  await axios.post(
    `${config.laravelApiUrl}/internal/stream-status/reset`,
    {},
    {
      headers: {
        "X-Internal-Secret": config.internalApiSecret,
      },
    }
  );
  console.log("[SERVER] Stream statuses reset successfully.");
} catch (error: any) {
  console.error(`[SERVER] Failed to reset stream statuses: ${error.message}`);
}

const wss = new WebSocketServer({ port: config.serverPort });
console.log(`[SERVER] WS running on port ${config.serverPort}`);

interface WebSocketMessage {
  action: string;
  roomId: string;
  clientId?: string;
  token?: string; // Auth token
  transportId?: string;
  producerId?: string;
  dtlsParameters?: types.DtlsParameters;
  kind?: types.MediaKind;
  rtpParameters?: types.RtpParameters;
  rtpCapabilities?: types.RtpCapabilities;
  appData?: any;
  data?: any;
}

const pendingRemovals = new Map<string, NodeJS.Timeout>();
const adminClients = new Set<WebSocket>();

function broadcastActiveRooms() {
  const activeRooms = [];
  for (const room of rooms.rooms.values()) {
    // Consider a room active if it has at least one producer (streamer)
    if (room.producers.size > 0) {
      activeRooms.push({
        id: room.id, // room.id is the room name
        name: room.id,
        viewerCount: room.getViewerCount(),
      });
    }
  }

  const payload = JSON.stringify({
    action: "active-rooms",
    data: activeRooms,
  });

  for (const adminWs of adminClients) {
    if (adminWs.readyState === WebSocket.OPEN) {
      adminWs.send(payload);
    }
  }
}

// Broadcast active rooms every 3 seconds
setInterval(broadcastActiveRooms, 3000);

// Keep-alive interval to prevent load balancer timeouts
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "heartbeat" }));
    }
  });
}, 25000);

wss.on("connection", (ws: WebSocket, req) => {
  // const clientId = crypto.randomUUID(); // This clientId is for the WS connection, not the client in the room
  // console.log("[SERVER] Client connected:", clientId);

  let currentRoomId: string | null = null;
  let currentClientId: string | null = null;

  ws.on("message", async (message: string) => {
    try {
      const msg = JSON.parse(message);
      const { action, roomId, clientId, data } = msg as WebSocketMessage; // Cast msg to WebSocketMessage

      console.log(
        `[SERVER] Received action: ${action} | Room: ${roomId} | Client: ${
          clientId || "N/A"
        }`
      );

      if (!roomId) {
        console.error("Missing roomId");
        return;
      }

      currentRoomId = roomId;
      if (clientId) currentClientId = clientId;

      // const router = await getRouter(); // Use the helper function to get the router
      // const router = await getRouter(); // Use the helper function to get the router
      const room = rooms.getOrCreate(roomId, router);

      if (action === "join-as-admin") {
        console.log(
          `[SERVER] Admin joined dashboard. Total admins: ${
            adminClients.size + 1
          }`
        );
        adminClients.add(ws);

        // Send immediate update
        broadcastActiveRooms();

        ws.on("close", () => {
          console.log("[SERVER] Admin disconnected from dashboard");
          adminClients.delete(ws);
        });
        return;
      }

      if (action === "join-as-streamer") {
        // Changed from "join-room"
        if (!clientId) {
          console.error("Missing clientId for join-as-streamer");
          return;
        }
        console.log(`[SERVER] Client joined as streamer: ${clientId}`);

        // Cancel pending removal if exists
        if (pendingRemovals.has(clientId)) {
          console.log(`[SERVER] Client ${clientId} reconnected (streamer)`);
          clearTimeout(pendingRemovals.get(clientId));
          pendingRemovals.delete(clientId);
        }

        // Clean up any existing session for this client to prevent ghost state
        // This ensures we don't have lingering transports/producers if they crashed and came back
        const removedProducerIds = room.removeClient(clientId);
        if (removedProducerIds.length > 0) {
          console.log(`[SERVER] Cleaned up old session for ${clientId}`);
          // Notify admins that the old producer is gone (so they can consume the new one)
          // Actually, we can just let the new producer flow handle it, but sending producer-closed is safer
          for (const producerId of removedProducerIds) {
            for (const [otherClientId, otherWs] of room.clients) {
              if (
                otherClientId !== clientId &&
                otherWs.readyState === WebSocket.OPEN
              ) {
                otherWs.send(
                  JSON.stringify({
                    action: "producer-closed",
                    data: { producerId },
                  })
                );
              }
            }
          }
        }

        room.addClient(clientId, ws);

        ws.send(
          JSON.stringify({
            action: "router-rtp-capabilities",
            data: router.rtpCapabilities,
          })
        );

        // Create transport
        const transport = await room.createSendTransport(clientId);

        ws.send(
          JSON.stringify({
            action: "create-send-transport",
            data: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
              iceServers: [
                {
                  urls: [`turn:${config.turnHostname}:3478`],
                  username: config.turnUsername,
                  credential: config.turnPassword,
                },
              ],
            },
          })
        );

        ws.send(JSON.stringify({ action: "start-produce" }));
      }

      // --- ADMIN / VIEWER ---
      if (action === "join-as-viewer") {
        if (!clientId) {
          console.error("Missing clientId for join-as-viewer");
          return;
        }
        room.addClient(clientId, ws);

        // Cancel pending removal if exists
        if (pendingRemovals.has(clientId)) {
          console.log(`[SERVER] Client ${clientId} reconnected (viewer)`);
          clearTimeout(pendingRemovals.get(clientId));
          pendingRemovals.delete(clientId);
        } else {
          room.addViewer(clientId); // Track viewer only if new
        }

        console.log(
          `[SERVER] Viewer joined room ${roomId} | Client: ${clientId}`
        );
        console.log(`[SERVER] Current viewers: ${Array.from(room.viewers)}`);

        // Broadcast viewer count to all clients in the room (including producer)
        const viewerCount = room.getViewerCount();
        for (const [_, clientWs] of room.clients) {
          clientWs.send(
            JSON.stringify({
              action: "viewer-count",
              count: viewerCount,
            })
          );
        }

        ws.send(
          JSON.stringify({
            action: "router-rtp-capabilities",
            data: router.rtpCapabilities,
          })
        );

        // Send existing producers to the viewer
        const producers = room.getProducers();
        ws.send(
          JSON.stringify({
            action: "existing-producers",
            data: producers,
          })
        );

        // Handle viewer disconnect to update count
        ws.on("close", () => {
          if (clientId) {
            room.removeViewer(clientId);
            console.log(
              `[SERVER] Viewer left room (socket close): ${clientId}`
            );
            const newCount = room.getViewerCount();
            for (const [_, clientWs] of room.clients) {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    action: "viewer-count",
                    count: newCount,
                  })
                );
              }
            }
          }
        });
      }

      if (action === "create-recv-transport") {
        if (!clientId) {
          console.error("Missing clientId for create-recv-transport");
          return;
        }
        const transport = await room.createRecvTransport(clientId);
        ws.send(
          JSON.stringify({
            action: "create-recv-transport",
            data: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
              iceServers: [
                {
                  urls: [`turn:${config.turnHostname}:3478`],
                  username: config.turnUsername,
                  credential: config.turnPassword,
                },
              ],
            },
          })
        );
      }

      if (action === "create-send-transport") {
        if (!clientId) {
          console.error("Missing clientId for create-send-transport");
          return;
        }
        const transport = await room.createSendTransport(clientId);
        ws.send(
          JSON.stringify({
            action: "create-send-transport",
            data: {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
              iceServers: [
                {
                  urls: [`turn:${config.turnHostname}:3478`],
                  username: config.turnUsername,
                  credential: config.turnPassword,
                },
              ],
            },
          })
        );
      }

      if (action === "consume") {
        if (!data.transportId || !data.producerId || !data.rtpCapabilities) {
          console.error(
            "Missing transportId, producerId, or rtpCapabilities for consume"
          );
          return;
        }
        if (!clientId) {
          console.error("Missing clientId for consume");
          return;
        }
        // The message should have: transportId, producerId, rtpCapabilities
        const { transportId, producerId, rtpCapabilities } = data;

        try {
          const consumer = await room.consume(
            clientId,
            transportId,
            producerId,
            rtpCapabilities
          );

          ws.send(
            JSON.stringify({
              action: "consume-done",
              data: {
                id: consumer.id,
                producerId: producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
              },
            })
          );

          // Resume consumer (it starts paused)
          // In a real app, you might wait for client to say "resume"
          // But here we can just resume immediately or let client ask for it.
          // Mediasoup docs recommend starting paused.
          // We will leave it paused and expect client to call 'resume-consumer' (not implemented yet)
          // OR just resume it here for simplicity if the client expects it.
          // Let's resume it here for now to make it easier.
          await consumer.resume();
        } catch (error) {
          console.error("Consume error:", error);
        }
      }

      if (action === "connect-transport") {
        if (!data.transportId || !data.dtlsParameters) {
          console.error("Missing transportId or dtlsParameters");
          return;
        }
        // Fixed: use connectTransport instead of connectSendTransport
        await room.connectTransport(data.transportId, data.dtlsParameters);

        ws.send(JSON.stringify({ action: "transport-connected" }));
      }

      switch (action) {
        case "restart-ice": {
          const { transportId } = data;
          const room = rooms.get(currentRoomId!);
          if (!room) {
            // Room gone (server restart?), tell client to reset
            ws.send(JSON.stringify({ action: "session-ended" }));
            return;
          }
          try {
            const iceParameters = await room.restartIce(transportId);
            ws.send(
              JSON.stringify({
                action: "restart-ice-done",
                data: {
                  transportId,
                  iceParameters,
                },
              })
            );
          } catch (error: any) {
            console.error(`[SERVER] Restart ICE failed: ${error.message}`);
            if (error.message.includes("not found")) {
              // Transport gone, tell client to reset
              ws.send(JSON.stringify({ action: "session-ended" }));
            }
          }
          break;
        }
      }

      if (action === "produce") {
        if (!data.kind || !data.rtpParameters || !data.transportId) {
          console.error("Missing kind, rtpParameters, or transportId");
          return;
        }
        if (!clientId) {
          console.error("Missing clientId for produce");
          return;
        }
        const producer = await room.produceWithTransportId(
          clientId,
          data.transportId,
          data.kind,
          data.rtpParameters,
          data.appData
        );

        ws.send(
          JSON.stringify({
            action: "produce-done",
            producerId: producer.id,
          })
        );

        // Notify other clients (Viewers) about the new producer
        for (const [otherClientId, otherWs] of room.clients) {
          if (otherClientId !== clientId) {
            otherWs.send(
              JSON.stringify({
                action: "new-producer",
                data: {
                  producerId: producer.id,
                  kind: producer.kind,
                  clientId: clientId,
                  appData: producer.appData,
                },
              })
            );
          }
        }
      }

      if (action === "close-producer") {
        if (!data.producerId) {
          console.error("Missing producerId for close-producer");
          return;
        }
        const { producerId } = data;
        const room = rooms.get(roomId);
        if (room) {
          room.closeProducer(producerId);

          // Notify other clients
          for (const [otherClientId, otherWs] of room.clients) {
            if (
              otherClientId !== clientId &&
              otherWs.readyState === WebSocket.OPEN
            ) {
              otherWs.send(
                JSON.stringify({
                  action: "producer-closed",
                  data: { producerId },
                })
              );
            }
          }
        }
      }
      if (action === "admin-action") {
        if (!data.targetClientId || !data.actionType) {
          console.error(
            "Missing targetClientId or actionType for admin-action"
          );
          return;
        }
        const { targetClientId, actionType } = data;
        const room = rooms.get(roomId);
        if (room) {
          const targetWs = room.clients.get(targetClientId);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            console.log(
              `[SERVER] Forwarding admin action ${actionType} to ${targetClientId}`
            );
            targetWs.send(
              JSON.stringify({
                action: "admin-action",
                data: {
                  type: actionType,
                  payload: data.payload,
                },
              })
            );
          } else {
            console.warn(
              `[SERVER] Target client ${targetClientId} not found or closed`
            );
          }
        }
      }
    } catch (error) {
      console.error("[SERVER] Error handling message:", error);
      console.error("[SERVER] Message content:", message);
    }
  });

  // Cleanup on disconnect
  ws.on("close", () => {
    if (currentRoomId && currentClientId) {
      console.log(
        `[SERVER] Client disconnected: ${currentClientId} from room ${currentRoomId}. Waiting for reconnect...`
      );

      // Check if client was a streamer (had producers)
      const room = rooms.get(currentRoomId!);
      let isStreamer = false;
      if (room) {
        for (const producer of room.producers.values()) {
          if (producer.appData.clientId === currentClientId) {
            isStreamer = true;
            break;
          }
        }
      }

      const gracePeriod = isStreamer ? 60000 : 5000; // 60s for streamer, 5s for viewer

      if (isStreamer) {
        console.log(
          `[SERVER] Streamer ${currentClientId} disconnected. Waiting ${gracePeriod}ms...`
        );
        // Notify admins of interruption
        const payload = JSON.stringify({
          action: "stream-interrupted",
          roomId: currentRoomId,
          clientId: currentClientId,
        });
        for (const adminWs of adminClients) {
          if (adminWs.readyState === WebSocket.OPEN) {
            adminWs.send(payload);
          }
        }
      }

      const timeout = setTimeout(() => {
        console.log(
          `[SERVER] Removing client ${currentClientId} after timeout (${
            isStreamer ? "streamer" : "viewer"
          })`
        );
        pendingRemovals.delete(currentClientId!);

        // Notify Laravel backend that stream ended
        axios
          .post(
            `${config.laravelApiUrl}/internal/stream-status`,
            {
              roomId: currentRoomId,
              clientId: currentClientId,
              status: "ended",
            },
            {
              headers: {
                "X-Internal-Secret": config.internalApiSecret,
              },
            }
          )
          .catch((err) => {
            console.error(
              `[SERVER] Failed to notify backend of stream end: ${err.message}. Check LARAVEL_API_URL in .env`
            );
          });

        const room = rooms.get(currentRoomId!);
        if (room) {
          const removedProducerIds = room.removeClient(currentClientId!);

          // Also remove as viewer if applicable
          room.removeViewer(currentClientId!);

          // Broadcast new viewer count
          const viewerCount = room.getViewerCount();
          for (const clientWs of room.clients.values()) {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  action: "viewer-count",
                  count: viewerCount,
                })
              );
            }
          }

          // Broadcast producer-closed to all other clients
          if (removedProducerIds.length > 0) {
            for (const producerId of removedProducerIds) {
              for (const [otherClientId, otherWs] of room.clients) {
                if (
                  otherClientId !== currentClientId &&
                  otherWs.readyState === WebSocket.OPEN
                ) {
                  otherWs.send(
                    JSON.stringify({
                      action: "producer-closed",
                      data: { producerId },
                    })
                  );
                }
              }
            }
          }

          // Update active rooms list for admins (remove the room if empty)
          broadcastActiveRooms();
        }
      }, gracePeriod); // Dynamic grace period

      pendingRemovals.set(currentClientId, timeout);
    }
  });
});
