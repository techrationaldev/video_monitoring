import { createWebRtcTransport } from "./mediasoup.js";
/**
 * Represents a conference room handling clients, transports, producers, and consumers.
 */
export class Room {
    /**
     * Creates an instance of Room.
     *
     * @param {string} id - The unique identifier for the room.
     * @param {types.Router} router - The Mediasoup router associated with this room.
     */
    constructor(id, router) {
        this.id = id;
        this.router = router;
        /** Map of client IDs to their WebSocket connections. */
        this.clients = new Map();
        /** Map of transport IDs to WebRtcTransport or PlainTransport instances. */
        this.transports = new Map();
        /** Map of producer IDs to Producer instances. */
        this.producers = new Map();
        /** Map of consumer IDs to Consumer instances. */
        this.consumers = new Map();
        /** Map of client IDs to a Set of their transport IDs. */
        this.clientTransports = new Map();
        /** Set of client IDs that are viewers. */
        this.viewers = new Set();
        /** Recording transports */
        this.recordingTransports = new Set();
        /** Flag to track if recording has been triggered */
        this.isRecording = false;
    }
    /**
     * Adds a client to the room.
     *
     * @param {string} clientId - The client's unique identifier.
     * @param {WebSocket} ws - The WebSocket connection for the client.
     * @returns {void}
     */
    addClient(clientId, ws) {
        this.clients.set(clientId, ws);
    }
    /**
     * Creates a WebRTC transport for a client.
     *
     * @param {string} clientId - The client's unique identifier.
     * @returns {Promise<types.WebRtcTransport>} The created transport.
     */
    async createTransport(clientId) {
        const transport = await createWebRtcTransport(this.router);
        this.transports.set(transport.id, transport);
        transport.on("dtlsstatechange", (dtlsState) => {
            console.log(`[SERVER] Transport ${transport.id} DTLS state: ${dtlsState}`);
        });
        transport.on("icestatechange", (iceState) => {
            console.log(`[SERVER] Transport ${transport.id} ICE state: ${iceState}`);
        });
        if (!this.clientTransports.has(clientId)) {
            this.clientTransports.set(clientId, new Set());
        }
        this.clientTransports.get(clientId).add(transport.id);
        return transport;
    }
    /**
     * Creates a send transport for a client (alias for createTransport).
     *
     * @param {string} clientId - The client's unique identifier.
     * @returns {Promise<types.WebRtcTransport>} The created transport.
     */
    async createSendTransport(clientId) {
        return this.createTransport(clientId);
    }
    /**
     * Creates a receive transport for a client (alias for createTransport).
     *
     * @param {string} clientId - The client's unique identifier.
     * @returns {Promise<types.WebRtcTransport>} The created transport.
     */
    async createRecvTransport(clientId) {
        return this.createTransport(clientId);
    }
    /**
     * Creates a PlainTransport for recording.
     */
    async createPlainTransport(clientIp, audioPort, videoPort) {
        const transport = await this.router.createPlainTransport({
            listenIp: "0.0.0.0", // Listen on all interfaces
            rtcpMux: true, // Use RTCP Mux to avoid needing separate RTCP ports
            comedia: false, // We are pushing to FFmpeg
        });
        this.transports.set(transport.id, transport);
        this.recordingTransports.add(transport.id);
        console.log(`[SERVER] Created PlainTransport ${transport.id} for recording`);
        // Connect to the remote FFmpeg ports
        // Note: If rtcpMux is false, we need to connect RTCP ports too, usually port+1.
        // For simplicity in this mock, we assume simple RTP.
        // But Mediasoup requires connect() for PlainTransport to know where to send.
        const connectParams = { ip: clientIp };
        if (audioPort)
            connectParams.port = audioPort; // This is actually tricky. PlainTransport has one target tuple.
        // If we have both audio and video, we need TWO PlainTransports usually, or one with multiplexing if FFmpeg supports it differently.
        // Standard Mediasoup practice: One PlainTransport per stream (Audio/Video).
        // REVISION: The createPlainTransport should probably only handle ONE stream or we create TWO internally.
        // But the API expects one call.
        // Let's create TWO transports if both ports are provided?
        // Or just one if we only record one.
        // Wait, FFmpeg -i sdp can handle multiple m= lines.
        // Each m= line corresponds to a port.
        // Mediasoup Router needs to send Audio to Port A and Video to Port B.
        // This requires TWO PlainTransports (one for audio, one for video) OR a multi-stream approach (uncommon with PlainTransport).
        // Let's assume we create one transport for Video (if present) and one for Audio (if present).
        // But the return value needs to reflect that?
        // Let's simplify: Just support Video for now or create two and map them?
        // The API returns `transportId`.
        // Let's change the implementation:
        // We will create up to two transports.
        // But `api.ts` expects one return.
        // Actually, let's just create one PlainTransport per stream.
        // The `api.ts` logic I wrote is too simple.
        // Let's allow `createPlainTransport` to take a specific kind and port.
        // But I can't change the API signature easily without changing `api.ts`.
        // Let's stick to: We create one transport per stream.
        // `createRecordingTransport` in `api.ts` should probably iterate.
        // But for this specific function `createPlainTransport`:
        // If I call it, it creates ONE transport.
        if (videoPort) {
            await transport.connect({ ip: clientIp, port: videoPort });
        }
        else if (audioPort) {
            await transport.connect({ ip: clientIp, port: audioPort });
        }
        // Consume logic should happen here or in API?
        // Let's do it here.
        const producers = this.getProducers();
        // Find a producer that matches the "kind" we are connecting to?
        // This is getting messy because of the "One transport vs Two" issue.
        // Let's revert to: The API calls `createPlainTransport` twice if needed?
        // No, `recording-service` calls once.
        // Okay, let's look at `recording-service` again.
        // It calls `create-recording-transport`.
        // It expects ONE SDP.
        // The SDP can have 2 m= lines.
        // We need 2 PlainTransports in Mediasoup to send to 2 different ports on the same FFmpeg instance.
        // So `createRecordingTransports` (plural) is better.
        return transport;
    }
    async createRecordingTransportTuple(clientIp, audioPort, videoPort) {
        const transports = [];
        if (audioPort) {
            const t = await this.router.createPlainTransport({
                listenIp: "0.0.0.0",
                rtcpMux: true,
                comedia: false,
            });
            await t.connect({ ip: clientIp, port: audioPort });
            this.transports.set(t.id, t);
            this.recordingTransports.add(t.id);
            transports.push({ kind: "audio", transport: t });
            // Find Audio Producer and Consume
            const audioProducer = Array.from(this.producers.values()).find((p) => p.kind === "audio");
            if (audioProducer) {
                console.log(`[SERVER] Consuming audio producer ${audioProducer.id} for recording`);
                const consumer = await t.consume({
                    producerId: audioProducer.id,
                    rtpCapabilities: this.router.rtpCapabilities,
                    paused: false,
                });
                console.log(`[SERVER] Created audio consumer ${consumer.id} for recording`);
            }
            else {
                console.warn(`[SERVER] No audio producer found for recording`);
            }
        }
        if (videoPort) {
            const t = await this.router.createPlainTransport({
                listenIp: "0.0.0.0",
                rtcpMux: true,
                comedia: false,
            });
            await t.connect({ ip: clientIp, port: videoPort });
            this.transports.set(t.id, t);
            this.recordingTransports.add(t.id);
            transports.push({ kind: "video", transport: t });
            const videoProducer = Array.from(this.producers.values()).find((p) => p.kind === "video");
            if (videoProducer) {
                console.log(`[SERVER] Consuming video producer ${videoProducer.id} for recording`);
                const consumer = await t.consume({
                    producerId: videoProducer.id,
                    rtpCapabilities: this.router.rtpCapabilities,
                    paused: false,
                });
                console.log(`[SERVER] Created video consumer ${consumer.id} for recording`);
                // Request Keyframe to ensure recording starts immediately
                try {
                    await consumer.requestKeyFrame();
                    console.log(`[SERVER] Requested keyframe for consumer ${consumer.id}`);
                }
                catch (error) {
                    console.warn(`[SERVER] Failed to request keyframe: ${error.message}`);
                }
                // Log stats periodically
                const statsInterval = setInterval(async () => {
                    try {
                        const stats = await consumer.getStats();
                        console.log(`[SERVER] Recording Consumer Stats (${consumer.id}):`, JSON.stringify(stats));
                    }
                    catch (e) {
                        console.error(`[SERVER] Failed to get stats:`, e);
                    }
                }, 5000);
                // Clear interval on close
                consumer.on("transportclose", () => clearInterval(statsInterval));
                consumer.on("producerclose", () => clearInterval(statsInterval));
            }
            else {
                console.warn(`[SERVER] No video producer found for recording`);
            }
        }
        return transports;
    }
    closeRecordingTransports() {
        for (const id of this.recordingTransports) {
            const t = this.transports.get(id);
            if (t)
                t.close();
            this.transports.delete(id);
        }
        this.recordingTransports.clear();
    }
    /**
     * Connects a transport with DTLS parameters.
     *
     * @param {string} transportId - The ID of the transport to connect.
     * @param {types.DtlsParameters} dtls - The DTLS parameters.
     * @returns {Promise<boolean>} True if connected successfully.
     * @throws {Error} If transport is not found.
     */
    async connectTransport(transportId, dtls) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }
        if (!("iceParameters" in transport)) {
            throw new Error(`Transport ${transportId} is not a WebRtcTransport`);
        }
        await transport.connect({
            dtlsParameters: dtls,
        });
        return true;
    }
    /**
     * Restarts ICE for a transport.
     *
     * @param {string} transportId - The ID of the transport.
     * @returns {Promise<types.IceParameters>} The new ICE parameters.
     * @throws {Error} If transport is not found.
     */
    async restartIce(transportId) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }
        if (!("iceParameters" in transport)) {
            throw new Error(`Transport ${transportId} is not a WebRtcTransport`);
        }
        const iceParameters = await transport.restartIce();
        return iceParameters;
    }
    /**
     * Creates a producer on the first available transport.
     *
     * @param {string} clientId - The client's unique identifier.
     * @param {types.MediaKind} kind - The media kind (audio/video).
     * @param {types.RtpParameters} rtp - The RTP parameters.
     * @returns {Promise<types.Producer>} The created producer.
     * @throws {Error} If no transport is available.
     */
    async produce(clientId, kind, rtp, appData = {}) {
        // Fallback: use the first available transport (for backward compatibility)
        const transport = [...this.transports.values()][0];
        if (!transport) {
            throw new Error("No transport available for producing");
        }
        const producer = await transport.produce({
            kind,
            rtpParameters: rtp,
            appData: { ...appData, clientId },
        });
        this.producers.set(producer.id, producer);
        producer.on("transportclose", () => {
            this.producers.delete(producer.id);
        });
        return producer;
    }
    /**
     * Creates a producer on a specific transport.
     *
     * @param {string} clientId - The client's unique identifier.
     * @param {string} transportId - The ID of the transport to produce on.
     * @param {types.MediaKind} kind - The media kind.
     * @param {types.RtpParameters} rtp - The RTP parameters.
     * @param {any} [appData={}] - Additional application data.
     * @returns {Promise<types.Producer>} The created producer.
     * @throws {Error} If transport is not found.
     */
    async produceWithTransportId(clientId, transportId, kind, rtp, appData = {}) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }
        const producer = await transport.produce({
            kind,
            rtpParameters: rtp,
            appData: { ...appData, clientId },
        });
        this.producers.set(producer.id, producer);
        producer.on("transportclose", () => {
            this.producers.delete(producer.id);
        });
        return producer;
    }
    /**
     * Consumes a media producer.
     *
     * @param {string} clientId - The client's unique identifier.
     * @param {string} consumerTransportId - The ID of the transport to consume on.
     * @param {string} producerId - The ID of the producer to consume.
     * @param {types.RtpCapabilities} rtpCapabilities - The client's RTP capabilities.
     * @returns {Promise<types.Consumer>} The created consumer.
     * @throws {Error} If consumption is not possible or transport is not found.
     */
    async consume(clientId, consumerTransportId, producerId, rtpCapabilities) {
        const router = this.router;
        if (!router.canConsume({ producerId, rtpCapabilities })) {
            throw new Error("Cannot consume");
        }
        const transport = this.transports.get(consumerTransportId);
        if (!transport) {
            throw new Error(`Transport ${consumerTransportId} not found`);
        }
        const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true, // Start paused
        });
        this.consumers.set(consumer.id, consumer);
        consumer.on("transportclose", () => {
            this.consumers.delete(consumer.id);
        });
        return consumer;
    }
    /**
     * Registers a client as a viewer.
     *
     * @param {string} clientId - The client's unique identifier.
     * @returns {void}
     */
    addViewer(clientId) {
        this.viewers.add(clientId);
    }
    /**
     * Removes a client from the viewers list.
     *
     * @param {string} clientId - The client's unique identifier.
     * @returns {void}
     */
    removeViewer(clientId) {
        this.viewers.delete(clientId);
    }
    /**
     * Removes a client and cleans up their resources (transports, producers).
     *
     * @param {string} clientId - The client's unique identifier.
     * @returns {string[]} Array of producer IDs that were removed.
     */
    removeClient(clientId) {
        console.log(`[SERVER] Removing client ${clientId}`);
        const removedProducerIds = [];
        // Find producers for this client
        for (const [producerId, producer] of this.producers) {
            if (producer.appData.clientId === clientId) {
                removedProducerIds.push(producerId);
            }
        }
        // Remove WebSocket
        this.clients.delete(clientId);
        // Close transports
        const transportIds = this.clientTransports.get(clientId);
        if (transportIds) {
            for (const transportId of transportIds) {
                const transport = this.transports.get(transportId);
                if (transport) {
                    console.log(`[SERVER] Closing transport ${transportId} for client ${clientId}`);
                    transport.close();
                    this.transports.delete(transportId);
                }
            }
            this.clientTransports.delete(clientId);
        }
        return removedProducerIds;
    }
    /**
     * Gets the current count of viewers in the room.
     *
     * @returns {number} The viewer count.
     */
    getViewerCount() {
        return this.viewers.size;
    }
    /**
     * Gets a list of active producers in the room.
     *
     * @returns {Array<{id: string, kind: types.MediaKind, clientId: any}>} Array of producer details.
     */
    getProducers() {
        return Array.from(this.producers.values()).map((p) => ({
            id: p.id,
            kind: p.kind,
            rtpParameters: p.rtpParameters,
            clientId: p.appData.clientId,
            appData: p.appData,
        }));
    }
    /**
     * Closes a specific producer.
     *
     * @param {string} producerId - The ID of the producer to close.
     * @returns {void}
     */
    closeProducer(producerId) {
        const producer = this.producers.get(producerId);
        if (producer) {
            producer.close();
            this.producers.delete(producerId);
        }
    }
}
/**
 * Manages the collection of Room instances.
 */
export class Rooms {
    constructor() {
        /** Map of room IDs to Room instances. */
        this.rooms = new Map();
    }
    /**
     * Retrieves an existing room or creates a new one.
     *
     * @param {string} roomId - The unique identifier for the room.
     * @param {types.Router} router - The Mediasoup router.
     * @returns {Room} The Room instance.
     */
    getOrCreate(roomId, router) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Room(roomId, router));
        }
        return this.rooms.get(roomId);
    }
    /**
     * Retrieves a room by its ID.
     *
     * @param {string} roomId - The unique identifier for the room.
     * @returns {Room | undefined} The Room instance or undefined if not found.
     */
    get(roomId) {
        return this.rooms.get(roomId);
    }
}
/**
 * Singleton instance of the Rooms manager.
 */
export const rooms = new Rooms();
