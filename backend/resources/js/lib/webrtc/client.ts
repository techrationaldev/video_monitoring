import { Device } from 'mediasoup-client';
import type { RtpCapabilities, TransportOptions } from 'mediasoup-client/types';

export class ClientWebRTC {
    private ws: WebSocket;
    private device: Device | null = null;
    private sendTransport: any;
    private roomId: string;
    private clientId: string;
    private deviceLoadedPromise: Promise<void>;
    private deviceLoadedResolver: (() => void) | null = null;

    constructor(serverUrl: string, roomId: string, clientId: string) {
        this.ws = new WebSocket(serverUrl);
        this.roomId = roomId;
        this.clientId = clientId;
        this.deviceLoadedPromise = new Promise((resolve) => {
            this.deviceLoadedResolver = resolve;
        });

        console.log(
            '[CLIENT] WebRTC Client Created, room:',
            roomId,
            'client:',
            clientId,
        );
    }

    onMessage(callback: (data: any) => void) {
        this.ws.onmessage = (msg) => {
            console.log('[CLIENT] WS MESSAGE RAW:', msg.data);
            callback(JSON.parse(msg.data));
        };
    }

    send(data: any) {
        const msg = { ...data, clientId: this.clientId };
        console.log('[CLIENT] WS SEND:', msg);
        this.ws.send(JSON.stringify(msg));
    }

    async init() {
        return new Promise<void>((resolve) => {
            this.ws.onopen = () => {
                console.log('[CLIENT] WS CONNECTED');
                this.send({ action: 'join-as-streamer', roomId: this.roomId });
                resolve();
            };
        });
    }

    async loadDevice(routerCaps: RtpCapabilities) {
        console.log('[CLIENT] Loading device with capabilities:', routerCaps);

        this.device = new Device();
        await this.device.load({ routerRtpCapabilities: routerCaps });

        console.log('[CLIENT] Device loaded');
        if (this.deviceLoadedResolver) {
            this.deviceLoadedResolver();
        }
    }

    async createSendTransport(options: TransportOptions) {
        console.log('[CLIENT] createSendTransport options received:', options);

        if (!options) {
            console.error(
                '[CLIENT] ERROR! createSendTransport called with EMPTY options',
            );
            return;
        }

        // Wait for device to be loaded
        await this.deviceLoadedPromise;

        if (!this.device) {
            console.error('[CLIENT] Device is null after waiting!');
            return;
        }

        this.sendTransport = this.device.createSendTransport(options);

        this.sendTransport.on(
            'connect',
            ({ dtlsParameters }: any, callback: any) => {
                console.log('[CLIENT] Transport connect');

                this.send({
                    action: 'connect-transport',
                    roomId: this.roomId,
                    data: {
                        transportId: this.sendTransport.id,
                        dtlsParameters,
                    },
                });
                callback();
            },
        );

        this.sendTransport.on('connectionstatechange', (state: string) => {
            console.log('[CLIENT] Transport connection state changed:', state);
        });

        this.sendTransport.on(
            'produce',
            ({ kind, rtpParameters }: any, callback: any) => {
                console.log('[CLIENT] Transport produce');

                this.send({
                    action: 'produce',
                    roomId: this.roomId,
                    data: {
                        transportId: this.sendTransport.id,
                        kind,
                        rtpParameters,
                    },
                });

                // We need to handle produce-done here or via main message handler
                // The current implementation in index.tsx might not be sufficient for the callback
                // But let's stick to the existing pattern where we listen for produce-done
                // However, the callback needs to be called when we get the ID.

                // TEMPORARY FIX: We attach a one-time listener for produce-done
                const handleProduceDone = (msg: MessageEvent) => {
                    const res = JSON.parse(msg.data);
                    if (res.action === 'produce-done') {
                        console.log(
                            '[CLIENT] producer created:',
                            res.producerId,
                        );
                        callback({ id: res.producerId });
                        this.ws.removeEventListener(
                            'message',
                            handleProduceDone,
                        );
                    }
                };
                this.ws.addEventListener('message', handleProduceDone);
            },
        );
    }

    async startVideoStream(videoEl: HTMLVideoElement) {
        console.log('[CLIENT] Requesting camera...');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
        });

        videoEl.srcObject = stream;

        const track = stream.getVideoTracks()[0];
        console.log('[CLIENT] Sending video track...');

        if (!this.sendTransport) {
            console.error('[CLIENT] sendTransport is not ready!');
            return;
        }

        await this.sendTransport.produce({ track });
    }
}
