import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { Device } from 'mediasoup-client';
import { useEffect, useRef, useState } from 'react';

interface Props {
    roomId: string;
}

interface VideoStream {
    id: string; // Consumer ID
    producerId: string;
    track: MediaStreamTrack;
}

export default function RoomMonitorPage({ roomId }: Props) {
    return (
        <AppLayout breadcrumbs={[{ title: 'Room Monitor', href: '#' }]}>
            <Head title={`Monitor Room ${roomId}`} />
            <RoomMonitor roomId={roomId} />
        </AppLayout>
    );
}

export function RoomMonitor({
    roomId,
    variant = 'full',
}: Props & { variant?: 'full' | 'card' }) {
    const [streams, setStreams] = useState<VideoStream[]>([]);
    const deviceRef = useRef<Device | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const recvTransportRef = useRef<any>(null);
    const consumersRef = useRef<Map<string, any>>(new Map());
    const pendingProducersRef = useRef<string[]>([]);
    const clientIdRef = useRef<string>(crypto.randomUUID());
    const [connectionStatus, setConnectionStatus] = useState<
        'connected' | 'disconnected' | 'reconnecting'
    >('disconnected');

    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimeout: NodeJS.Timeout;

        const connect = () => {
            const wsUrl =
                import.meta.env.VITE_MEDIASOUP_WS_URL || 'ws://localhost:5005';
            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('Connected to Mediasoup Server');
                setConnectionStatus('connected');
                // Join as viewer
                ws?.send(
                    JSON.stringify({
                        action: 'join-as-viewer',
                        roomId: roomId,
                        clientId: clientIdRef.current,
                    }),
                );
            };

            ws.onmessage = async (event) => {
                const msg = JSON.parse(event.data);
                const { action, data } = msg;

                switch (action) {
                    case 'router-rtp-capabilities':
                        await loadDevice(data);
                        // After loading device, create recv transport
                        ws?.send(
                            JSON.stringify({
                                action: 'create-recv-transport',
                                roomId,
                                clientId: clientIdRef.current,
                            }),
                        );
                        break;

                    case 'create-recv-transport':
                        await createRecvTransport(data);
                        break;

                    case 'existing-producers':
                        // data is array of { id, kind }
                        for (const producer of data) {
                            consumeProducer(producer.id);
                        }
                        break;

                    case 'new-producer':
                        // data is { producerId, kind }
                        consumeProducer(data.producerId);
                        break;

                    case 'producer-closed':
                        // data is { producerId }
                        setStreams((prev) =>
                            prev.filter(
                                (s) => s.producerId !== data.producerId,
                            ),
                        );
                        break;

                    case 'consume-done':
                        await handleConsumeDone(data);
                        break;

                    case 'transport-connected':
                        // Transport connected successfully
                        break;

                    case 'restart-ice-done':
                        await handleRestartIceDone(data);
                        break;
                }
            };

            ws.onclose = () => {
                console.log('WS Closed, reconnecting in 3s...');
                setConnectionStatus('reconnecting');
                reconnectTimeout = setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                console.error('WS Error:', err);
                ws?.close();
            };
        };

        connect();

        return () => {
            if (ws) ws.close();
            clearTimeout(reconnectTimeout);
        };
    }, [roomId]);

    const loadDevice = async (routerRtpCapabilities: any) => {
        try {
            const device = new Device();
            await device.load({ routerRtpCapabilities });
            deviceRef.current = device;
            console.log('Device loaded');
        } catch (error) {
            console.error('Failed to load device:', error);
        }
    };

    const createRecvTransport = async (transportData: any) => {
        const device = deviceRef.current;
        if (!device) return;

        const transport = device.createRecvTransport(transportData);
        recvTransportRef.current = transport;

        transport.on('connect', ({ dtlsParameters }, callback, errback) => {
            wsRef.current?.send(
                JSON.stringify({
                    action: 'connect-transport',
                    roomId,
                    clientId: clientIdRef.current,
                    data: {
                        transportId: transport.id,
                        dtlsParameters,
                    },
                }),
            );
            callback();
        });

        transport.on('connectionstatechange', (state: string) => {
            console.log(
                '[ADMIN] Recv Transport connection state changed:',
                state,
            );
            if (state === 'failed' || state === 'disconnected') {
                console.log('[ADMIN] Transport failed, restarting ICE...');
                restartIce(transport.id);
            }
        });

        console.log('Recv Transport created');

        // Process pending producers
        if (pendingProducersRef.current.length > 0) {
            console.log(
                `Processing ${pendingProducersRef.current.length} pending producers`,
            );
            for (const producerId of pendingProducersRef.current) {
                consumeProducer(producerId);
            }
            pendingProducersRef.current = [];
        }
    };

    const consumeProducer = (producerId: string) => {
        const device = deviceRef.current;
        const transport = recvTransportRef.current;
        if (!device || !transport) {
            console.warn(
                'Device or transport not ready to consume, queueing producer',
                producerId,
            );
            pendingProducersRef.current.push(producerId);
            return;
        }

        const rtpCapabilities = device.rtpCapabilities;

        wsRef.current?.send(
            JSON.stringify({
                action: 'consume',
                roomId,
                clientId: clientIdRef.current,
                data: {
                    transportId: transport.id,
                    producerId,
                    rtpCapabilities,
                },
            }),
        );
    };

    const handleConsumeDone = async (data: any) => {
        const { id, producerId, kind, rtpParameters } = data;
        const transport = recvTransportRef.current;

        if (!transport) return;

        const consumer = await transport.consume({
            id,
            producerId,
            kind,
            rtpParameters,
        });

        consumersRef.current.set(consumer.id, consumer);

        // Resume (server side resumed, but client side might need track handling)
        const stream = new MediaStream();
        stream.addTrack(consumer.track);

        setStreams((prev) => [
            ...prev,
            { id: consumer.id, producerId, track: consumer.track },
        ]);

        console.log(`Consuming ${kind} from producer ${producerId}`);
        console.log(`Consuming ${kind} from producer ${producerId}`);
    };

    const restartIce = (transportId: string) => {
        wsRef.current?.send(
            JSON.stringify({
                action: 'restart-ice',
                roomId,
                clientId: clientIdRef.current,
                data: { transportId },
            }),
        );
    };

    const handleRestartIceDone = async (data: any) => {
        const { transportId, iceParameters } = data;
        const transport = recvTransportRef.current;
        if (transport && transport.id === transportId) {
            console.log('[ADMIN] Restarting ICE with new parameters');
            await transport.restartIce({ iceParameters });
        }
    };

    console.log('RoomMonitor variant:', variant);

    if (variant === 'card') {
        return (
            <div className="h-full w-full bg-black">
                {streams.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-white"></div>
                            <span className="text-xs">Connecting...</span>
                        </div>
                    </div>
                ) : (
                    <div
                        className={`grid h-full w-full ${streams.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
                    >
                        {streams.map((stream) => (
                            <div
                                key={stream.id}
                                className="relative h-full w-full overflow-hidden"
                            >
                                <VideoPlayer
                                    track={stream.track}
                                    controls={false}
                                />
                                <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
                                    {stream.producerId.slice(0, 6)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="h-full p-6">
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Room:{' '}
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                        {roomId}
                    </span>
                </h2>
                <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                        connectionStatus === 'connected'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : connectionStatus === 'reconnecting'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}
                >
                    {connectionStatus === 'connected'
                        ? 'Active'
                        : connectionStatus === 'reconnecting'
                          ? 'Reconnecting...'
                          : 'Disconnected'}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {streams.length === 0 && (
                    <div className="col-span-full flex h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
                        <div className="mb-4 h-12 w-12 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700"></div>
                        <p className="text-lg font-medium">
                            Waiting for streams...
                        </p>
                        <p className="text-sm">
                            Streams will appear here automatically
                        </p>
                    </div>
                )}

                {streams.map((stream) => (
                    <div
                        key={stream.id}
                        className="overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
                    >
                        <div className="relative aspect-video bg-black">
                            <VideoPlayer track={stream.track} />
                            <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                <span className="rounded bg-black/60 px-2 py-1 font-mono text-xs text-white backdrop-blur-sm">
                                    ID: {stream.producerId.slice(0, 8)}
                                </span>
                            </div>
                            <div className="absolute top-3 right-3">
                                <span className="flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                                </span>
                            </div>
                        </div>
                        <div className="p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Live Stream
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    Video
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const VideoPlayer = ({
    track,
    controls = true,
}: {
    track: MediaStreamTrack;
    controls?: boolean;
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && track) {
            const stream = new MediaStream([track]);
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(console.error);
        }
    }, [track]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted // Muted required for autoplay
            controls={controls}
            className="h-full w-full object-cover"
        />
    );
};
