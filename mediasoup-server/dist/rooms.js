import { createWebRtcTransport } from "./mediasoup.js";
export class Room {
    constructor(id, router) {
        this.id = id;
        this.router = router;
        this.clients = new Map();
        this.transports = new Map();
        this.producers = new Map();
        this.consumers = new Map();
        this.clientTransports = new Map();
        this.viewers = new Set();
    }
    addClient(clientId, ws) {
        this.clients.set(clientId, ws);
    }
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
    // Alias for clarity, though underlying logic is same for now
    async createSendTransport(clientId) {
        return this.createTransport(clientId);
    }
    async createRecvTransport(clientId) {
        return this.createTransport(clientId);
    }
    async connectTransport(transportId, dtls) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }
        await transport.connect({ dtlsParameters: dtls });
        return true;
    }
    async restartIce(transportId) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }
        const iceParameters = await transport.restartIce();
        return iceParameters;
    }
    async produce(clientId, kind, rtp) {
        // Fallback: use the first available transport (for backward compatibility)
        const transport = [...this.transports.values()][0];
        if (!transport) {
            throw new Error("No transport available for producing");
        }
        const producer = await transport.produce({
            kind,
            rtpParameters: rtp,
            appData: { clientId },
        });
        this.producers.set(producer.id, producer);
        producer.on("transportclose", () => {
            this.producers.delete(producer.id);
        });
        return producer;
    }
    async produceWithTransportId(clientId, transportId, kind, rtp) {
        const transport = this.transports.get(transportId);
        if (!transport) {
            throw new Error(`Transport ${transportId} not found`);
        }
        const producer = await transport.produce({
            kind,
            rtpParameters: rtp,
            appData: { clientId },
        });
        this.producers.set(producer.id, producer);
        producer.on("transportclose", () => {
            this.producers.delete(producer.id);
        });
        return producer;
    }
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
    addViewer(clientId) {
        this.viewers.add(clientId);
    }
    removeViewer(clientId) {
        this.viewers.delete(clientId);
    }
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
    getViewerCount() {
        return this.viewers.size;
    }
    getProducers() {
        return Array.from(this.producers.values()).map((p) => ({
            id: p.id,
            kind: p.kind,
            clientId: p.appData.clientId,
        }));
    }
}
export class Rooms {
    constructor() {
        this.rooms = new Map();
    }
    getOrCreate(roomId, router) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Room(roomId, router));
        }
        return this.rooms.get(roomId);
    }
    get(roomId) {
        return this.rooms.get(roomId);
    }
}
// ⭐ Export a SINGLETON instance
export const rooms = new Rooms();
