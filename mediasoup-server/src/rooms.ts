import { createWebRtcTransport } from "./mediasoup.js";
import { types } from "mediasoup";
import { WebSocket } from "ws";

export class Room {
  constructor(public id: string, public router: types.Router) {}

  clients = new Map<string, WebSocket>();
  transports = new Map<string, types.WebRtcTransport>();
  producers = new Map<string, types.Producer>();

  consumers = new Map<string, types.Consumer>();

  clientTransports = new Map<string, Set<string>>();

  addClient(clientId: string, ws: WebSocket) {
    this.clients.set(clientId, ws);
  }

  async createTransport(clientId: string) {
    const transport = await createWebRtcTransport(this.router);
    this.transports.set(transport.id, transport);

    if (!this.clientTransports.has(clientId)) {
      this.clientTransports.set(clientId, new Set());
    }
    this.clientTransports.get(clientId)!.add(transport.id);

    return transport;
  }

  // Alias for clarity, though underlying logic is same for now
  async createSendTransport(clientId: string) {
    return this.createTransport(clientId);
  }

  async createRecvTransport(clientId: string) {
    return this.createTransport(clientId);
  }

  async connectTransport(transportId: string, dtls: types.DtlsParameters) {
    const transport = this.transports.get(transportId);
    if (!transport) {
      throw new Error(`Transport ${transportId} not found`);
    }
    await transport.connect({ dtlsParameters: dtls });
    return true;
  }

  async produce(
    clientId: string,
    kind: types.MediaKind,
    rtp: types.RtpParameters
  ) {
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

  async produceWithTransportId(
    clientId: string,
    transportId: string,
    kind: types.MediaKind,
    rtp: types.RtpParameters
  ) {
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

  async consume(
    clientId: string,
    consumerTransportId: string,
    producerId: string,
    rtpCapabilities: types.RtpCapabilities
  ) {
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

  viewers = new Set<string>();

  addViewer(clientId: string) {
    this.viewers.add(clientId);
  }

  removeViewer(clientId: string) {
    this.viewers.delete(clientId);
  }

  removeClient(clientId: string): string[] {
    const removedProducerIds: string[] = [];

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
    }));
  }
}

export class Rooms {
  rooms = new Map<string, Room>();

  getOrCreate(roomId: string, router: types.Router) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Room(roomId, router));
    }
    return this.rooms.get(roomId)!;
  }

  get(roomId: string) {
    return this.rooms.get(roomId);
  }
}

// ⭐ Export a SINGLETON instance
export const rooms = new Rooms();
