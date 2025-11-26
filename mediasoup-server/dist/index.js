import * as mediasoup from "mediasoup";
import { WebSocketServer, WebSocket } from "ws";
import axios from "axios";
import { rooms } from "./rooms.js";
import { config } from "./config.js";
let worker;
let router;
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
    }
    catch (err) {
        console.error("[SERVER] Failed to setup Mediasoup:", err);
        process.exit(1);
    }
}
await setupMediasoup();
const wss = new WebSocketServer({ port: config.serverPort });
console.log(`[SERVER] WS running on port ${config.serverPort}`);
// Keep-alive interval to prevent load balancer timeouts
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "heartbeat" }));
        }
    });
}, 25000);
wss.on("connection", (ws, req) => {
    // const clientId = crypto.randomUUID(); // This clientId is for the WS connection, not the client in the room
    // console.log("[SERVER] Client connected:", clientId);
    let currentRoomId = null;
    let currentClientId = null;
    ws.on("message", async (message) => {
        try {
            const msg = JSON.parse(message);
            const { action, roomId, clientId, data } = msg; // Cast msg to WebSocketMessage
            if (!roomId) {
                console.error("Missing roomId");
                return;
            }
            currentRoomId = roomId;
            if (clientId)
                currentClientId = clientId;
            // const router = await getRouter(); // Use the helper function to get the router
            const room = rooms.getOrCreate(roomId, router);
            if (action === "join-as-streamer") {
                // Changed from "join-room"
                if (!clientId) {
                    console.error("Missing clientId for join-as-streamer");
                    return;
                }
                console.log(`[SERVER] Client joined as streamer: ${clientId}`);
                room.addClient(clientId, ws);
                ws.send(JSON.stringify({
                    action: "router-rtp-capabilities",
                    data: router.rtpCapabilities,
                }));
                // Create transport
                const transport = await room.createSendTransport(clientId);
                ws.send(JSON.stringify({
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
                }));
                ws.send(JSON.stringify({ action: "start-produce" }));
            }
            // --- ADMIN / VIEWER ---
            if (action === "join-as-viewer") {
                if (!clientId) {
                    console.error("Missing clientId for join-as-viewer");
                    return;
                }
                room.addClient(clientId, ws);
                room.addViewer(clientId); // Track viewer
                console.log(`[SERVER] Viewer joined room ${roomId}`);
                // Broadcast viewer count to all clients in the room (including producer)
                const viewerCount = room.getViewerCount();
                for (const [_, clientWs] of room.clients) {
                    clientWs.send(JSON.stringify({
                        action: "viewer-count",
                        count: viewerCount,
                    }));
                }
                ws.send(JSON.stringify({
                    action: "router-rtp-capabilities",
                    data: router.rtpCapabilities,
                }));
                // Send existing producers to the viewer
                const producers = room.getProducers();
                ws.send(JSON.stringify({
                    action: "existing-producers",
                    data: producers,
                }));
                // Handle viewer disconnect to update count
                ws.on("close", () => {
                    if (clientId) {
                        room.removeViewer(clientId);
                        const newCount = room.getViewerCount();
                        for (const [_, clientWs] of room.clients) {
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify({
                                    action: "viewer-count",
                                    count: newCount,
                                }));
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
                ws.send(JSON.stringify({
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
                }));
            }
            if (action === "consume") {
                if (!data.transportId || !data.producerId || !data.rtpCapabilities) {
                    console.error("Missing transportId, producerId, or rtpCapabilities for consume");
                    return;
                }
                if (!clientId) {
                    console.error("Missing clientId for consume");
                    return;
                }
                // The message should have: transportId, producerId, rtpCapabilities
                const { transportId, producerId, rtpCapabilities } = data;
                try {
                    const consumer = await room.consume(clientId, transportId, producerId, rtpCapabilities);
                    ws.send(JSON.stringify({
                        action: "consume-done",
                        data: {
                            id: consumer.id,
                            producerId: producerId,
                            kind: consumer.kind,
                            rtpParameters: consumer.rtpParameters,
                        },
                    }));
                    // Resume consumer (it starts paused)
                    // In a real app, you might wait for client to say "resume"
                    // But here we can just resume immediately or let client ask for it.
                    // Mediasoup docs recommend starting paused.
                    // We will leave it paused and expect client to call 'resume-consumer' (not implemented yet)
                    // OR just resume it here for simplicity if the client expects it.
                    // Let's resume it here for now to make it easier.
                    await consumer.resume();
                }
                catch (error) {
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
            if (action === "restart-ice") {
                if (!data.transportId) {
                    console.error("Missing transportId for restart-ice");
                    return;
                }
                try {
                    const iceParameters = await room.restartIce(data.transportId);
                    ws.send(JSON.stringify({
                        action: "restart-ice-done",
                        data: {
                            transportId: data.transportId,
                            iceParameters,
                        },
                    }));
                }
                catch (error) {
                    if (error.message.includes("not found")) {
                        console.warn(`[SERVER] Restart ICE failed: ${error.message} (Client might have disconnected)`);
                    }
                    else {
                        console.error("[SERVER] Restart ICE error:", error);
                    }
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
                const producer = await room.produceWithTransportId(clientId, data.transportId, data.kind, data.rtpParameters);
                ws.send(JSON.stringify({
                    action: "produce-done",
                    producerId: producer.id,
                }));
                // Notify other clients (Viewers) about the new producer
                for (const [otherClientId, otherWs] of room.clients) {
                    if (otherClientId !== clientId) {
                        otherWs.send(JSON.stringify({
                            action: "new-producer",
                            data: {
                                producerId: producer.id,
                                kind: producer.kind,
                            },
                        }));
                    }
                }
            }
        }
        catch (error) {
            console.error("[SERVER] Error handling message:", error);
        }
    });
    // Cleanup on disconnect
    ws.on("close", () => {
        if (currentRoomId && currentClientId) {
            console.log(`[SERVER] Client disconnected: ${currentClientId} from room ${currentRoomId}`);
            // Notify Laravel backend that stream ended
            axios
                .post(`${config.laravelApiUrl}/internal/stream-status`, {
                roomId: currentRoomId,
                clientId: currentClientId,
                status: "ended",
            })
                .catch((err) => {
                console.error(`[SERVER] Failed to notify backend of stream end: ${err.message}. Check LARAVEL_API_URL in .env`);
            });
            const room = rooms.get(currentRoomId);
            if (room) {
                const removedProducerIds = room.removeClient(currentClientId);
                // Also remove as viewer if applicable
                room.removeViewer(currentClientId);
                // Broadcast new viewer count
                const viewerCount = room.getViewerCount();
                for (const clientWs of room.clients.values()) {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({
                            action: "viewer-count",
                            count: viewerCount,
                        }));
                    }
                }
                // Broadcast producer-closed to all other clients
                if (removedProducerIds.length > 0) {
                    for (const producerId of removedProducerIds) {
                        for (const [otherClientId, otherWs] of room.clients) {
                            if (otherClientId !== currentClientId &&
                                otherWs.readyState === WebSocket.OPEN) {
                                otherWs.send(JSON.stringify({
                                    action: "producer-closed",
                                    data: { producerId },
                                }));
                            }
                        }
                    }
                }
            }
        }
    });
});
