import { Device } from 'mediasoup-client';
import type { RtpCapabilities, TransportOptions } from 'mediasoup-client/types';

export class ClientWebRTC {
    private ws: WebSocket;
    private device: Device | null = null;
    private sendTransport: any;
    private producers = new Map<string, any>();
    private audioProducer: any = null;
    private videoProducer: any = null;
    private roomId: string;
    private clientId: string;
    private deviceLoadedPromise: Promise<void>;
    private deviceLoadedResolver: (() => void) | null = null;
    private transportReadyPromise: Promise<void>;
    private transportReadyResolver: (() => void) | null = null;

    constructor(serverUrl: string, roomId: string, clientId: string) {
        this.ws = new WebSocket(serverUrl);
        this.roomId = roomId;
        this.clientId = clientId;
        this.deviceLoadedPromise = new Promise((resolve) => {
            this.deviceLoadedResolver = resolve;
        });
        this.transportReadyPromise = new Promise((resolve) => {
            this.transportReadyResolver = resolve;
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
            const data = JSON.parse(msg.data);
            console.log(`[CLIENT] WS RECV: ${data.action}`, data);

            if (data.action === 'restart-ice-done') {
                this.handleRestartIceDone(data.data);
            }

            if (data.action === 'session-ended') {
                console.warn(
                    '[CLIENT] Session ended by server (restart?), reloading...',
                );
                window.location.reload();
            }

            callback(data);
        };
    }

    send(data: any) {
        const msg = { ...data, clientId: this.clientId };
        console.log(`[CLIENT] WS SEND: ${data.action}`, msg);
        this.ws.send(JSON.stringify(msg));
    }

    async init() {
        return new Promise<void>((resolve) => {
            this.connectWs(resolve);
        });
    }

    private connectWs(resolve?: () => void) {
        this.ws = new WebSocket(this.ws.url); // Re-use URL

        this.ws.onopen = () => {
            console.log('[CLIENT] WS CONNECTED');
            this.send({ action: 'join-as-streamer', roomId: this.roomId });
            if (resolve) resolve();
        };

        this.ws.onclose = () => {
            console.log('[CLIENT] WS CLOSED, reconnecting in 3s...');
            setTimeout(() => this.connectWs(), 3000);
        };

        this.ws.onerror = (err) => {
            console.error('[CLIENT] WS ERROR:', err);
            this.ws.close(); // Trigger onclose
        };

        // Re-attach message handler
        this.onMessage((data) => {
            // Handle messages (we need to store the callback if we want to re-attach it properly)
            // For now, let's assume the main logic handles re-init if needed,
            // but ideally we should emit events.
            // Since this class is simple, we might need to refactor to support proper event emission on reconnect.
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
        if (this.transportReadyResolver) {
            this.transportReadyResolver();
        }

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

        this.sendTransport.on(
            'connectionstatechange',
            async (state: string) => {
                console.log(
                    `[CLIENT] Send Transport connection state changed: ${state}`,
                );
                if (state === 'failed' || state === 'disconnected') {
                    console.warn(
                        '[CLIENT] Transport failed/disconnected. Not restarting ICE to avoid loops. Reloading...',
                    );
                    // this.restartIce(this.sendTransport.id);
                    window.location.reload();
                }
            },
        );

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

    async produceStream(stream: MediaStream) {
        await this.transportReadyPromise;

        if (!this.sendTransport) {
            console.error('[CLIENT] sendTransport is not ready!');
            return;
        }

        // Produce Video
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            console.log('[CLIENT] Producing video track...');
            this.videoProducer = await this.sendTransport.produce({
                track: videoTrack,
            });
            this.producers.set('video', this.videoProducer);
        }

        // Produce Audio
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
            console.log('[CLIENT] Producing audio track...');
            this.audioProducer = await this.sendTransport.produce({
                track: audioTrack,
            });
            this.producers.set('audio', this.audioProducer);
        }
    }

    async replaceVideoTrack(track: MediaStreamTrack) {
        if (this.videoProducer) {
            await this.videoProducer.replaceTrack({ track });
        }
    }

    muteAudio() {
        if (this.audioProducer) {
            this.audioProducer.pause(); // Mediasoup "pause" on producer stops sending RTP
        }
    }

    unmuteAudio() {
        if (this.audioProducer) {
            this.audioProducer.resume();
        }
    }

    pauseVideo() {
        if (this.videoProducer) {
            this.videoProducer.pause();
        }
    }

    resumeVideo() {
        if (this.videoProducer) {
            this.videoProducer.resume();
        }
    }

    restartIce(transportId: string) {
        this.send({
            action: 'restart-ice',
            roomId: this.roomId,
            data: { transportId },
        });
    }

    async handleRestartIceDone(data: any) {
        const { transportId, iceParameters } = data;
        if (this.sendTransport && this.sendTransport.id === transportId) {
            console.log('[CLIENT] Restarting ICE with new parameters');
            await this.sendTransport.restartIce({ iceParameters });
        }
    }
    handleAdminAction(actionType: string, payload?: any) {
        console.log(`[CLIENT] Handling admin action: ${actionType}`, payload);
        switch (actionType) {
            case 'mute-audio':
                this.muteAudio();
                break;
            case 'unmute-audio':
                this.unmuteAudio();
                break;
            case 'mute-video':
                this.pauseVideo();
                break;
            case 'unmute-video':
                this.resumeVideo();
                break;
            case 'reload':
                window.location.reload();
                break;
            default:
                console.warn(`[CLIENT] Unknown admin action: ${actionType}`);
        }
    }
}
