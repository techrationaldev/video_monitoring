// src/roomManager.ts
export class RoomManager {
    constructor() {
        this.rooms = new Map();
    }
    createRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                clients: new Map(),
                transports: new Map(),
                producers: new Map(),
            });
        }
        return this.rooms.get(roomId);
    }
    joinRoom(roomId, client) {
        const room = this.createRoom(roomId);
        room.clients.set(client.id, client);
    }
    addTransport(roomId, transport) {
        this.rooms.get(roomId).transports.set(transport.id, transport);
    }
    getTransport(roomId, transportId) {
        return this.rooms.get(roomId).transports.get(transportId);
    }
    addProducer(roomId, clientId, producer) {
        this.rooms.get(roomId).producers.set(clientId, producer);
    }
}
