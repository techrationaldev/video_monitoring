import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { Device } from 'mediasoup-client';
import { useEffect, useRef, useState } from 'react';

interface Props {
    roomId: string;
}

interface MediaTrack {
    id: string; // Consumer ID
    producerId: string;
    kind: 'video' | 'audio';
    track: MediaStreamTrack;
    clientId: string;
}

interface ClientStream {
    clientId: string;
    video?: MediaTrack;
    audio?: MediaTrack;
}

function VideoPlayer({
    track,
    controls = true,
    muted = true,
}: {
    track: MediaStreamTrack;
    controls?: boolean;
    muted?: boolean;
}) {
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
            muted={muted}
            controls={controls}
            className="h-full w-full object-cover"
        />
    );
}

function AudioPlayer({
    track,
    muted,
}: {
    track: MediaStreamTrack;
    muted: boolean;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current && track) {
            const stream = new MediaStream([track]);
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(console.error);
        }
    }, [track]);

    return <audio ref={audioRef} autoPlay muted={muted} />;
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
    useEffect(() => {
        console.log('[ADMIN] RoomMonitor v2.1 loaded');
    }, []);
    const [tracks, setTracks] = useState<MediaTrack[]>([]);
    const [activeAudioClientId, setActiveAudioClientId] = useState<
        string | null
    >(null);

    // Group tracks by clientId
    const clientStreams = tracks.reduce<Record<string, ClientStream>>(
        (acc, track) => {
            if (!acc[track.clientId]) {
                acc[track.clientId] = { clientId: track.clientId };
            }
            if (track.kind === 'video') acc[track.clientId].video = track;
            if (track.kind === 'audio') acc[track.clientId].audio = track;
            return acc;
        },
        {},
    );
    const deviceRef = useRef<Device | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const recvTransportRef = useRef<any>(null);
    const consumersRef = useRef<Map<string, any>>(new Map());
    const pendingProducersRef = useRef<
        { producerId: string; clientId: string }[]
    >([]);
    const clientIdRef = useRef<string>('');

    if (!clientIdRef.current) {
        const stored = sessionStorage.getItem(`mediasoup-client-id-${roomId}`);
        if (stored) {
            clientIdRef.current = stored;
        } else {
            const newId = crypto.randomUUID();
            sessionStorage.setItem(`mediasoup-client-id-${roomId}`, newId);
            clientIdRef.current = newId;
        }
    }

    const [connectionStatus, setConnectionStatus] = useState<
        'connected' | 'disconnected' | 'reconnecting'
    >('disconnected');
    const [isInterrupted, setIsInterrupted] = useState(false);

    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimeout: NodeJS.Timeout;

        const connect = () => {
            const wsUrl =
                import.meta.env.VITE_MEDIASOUP_WS_URL || 'ws://localhost:5005';
            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[ADMIN] Connected to Mediasoup Server');
                setConnectionStatus('connected');
                // Join as viewer
                const payload = {
                    action: 'join-as-viewer',
                    roomId: roomId,
                    clientId: clientIdRef.current,
                };
                console.log('[ADMIN] Sending join-as-viewer:', payload);
                ws?.send(JSON.stringify(payload));
            };

            ws.onmessage = async (event) => {
                const msg = JSON.parse(event.data);
                const { action, data } = msg;
                console.log(`[ADMIN] WS RECV: ${action}`, data);

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
                            consumeProducer(producer.id, producer.clientId);
                        }
                        break;

                    case 'new-producer':
                        // data is { producerId, kind }
                        consumeProducer(data.producerId, data.clientId);
                        break;

                    case 'producer-closed':
                        // data is { producerId }
                        setTracks((prev) =>
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

                    case 'session-ended':
                        console.warn(
                            '[ADMIN] Session ended by server, reloading...',
                        );
                        window.location.reload();
                        break;

                    case 'stream-interrupted':
                        console.warn(
                            '[ADMIN] Stream interrupted (network drop?)',
                        );
                        setIsInterrupted(true);
                        break;
                }
            };

            ws.onclose = () => {
                console.log('[ADMIN] WS Closed, reconnecting in 3s...');
                setConnectionStatus('reconnecting');

                // Close transport to prevent it from trying to restart ICE
                if (recvTransportRef.current) {
                    recvTransportRef.current.close();
                    recvTransportRef.current = null;
                }

                reconnectTimeout = setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                console.error('[ADMIN] WS Error:', err);
                ws?.close();
            };
        };

        connect();

        return () => {
            if (ws) ws.close();
            clearTimeout(reconnectTimeout);

            // Reset refs on unmount/change
            deviceRef.current = null;
            recvTransportRef.current = null;
            consumersRef.current = new Map();
            pendingProducersRef.current = [];
            setTracks([]);
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

        transport.on('connectionstatechange', (state) => {
            console.log(
                `[ADMIN] Recv Transport connection state changed: ${state}`,
            );
            if (state === 'connected') {
                // Transport connected successfully
            } else if (state === 'disconnected' || state === 'failed') {
                console.warn(
                    '[ADMIN] Transport disconnected or failed; not attempting ICE restart to avoid errors.',
                );
                // Optionally close transport to clean up
                transport.close();
                recvTransportRef.current = null;
            }
        });

        // Process pending producers
        if (pendingProducersRef.current.length > 0) {
            console.log(
                `Processing ${pendingProducersRef.current.length} pending producers`,
            );
            for (const {
                producerId,
                clientId,
            } of pendingProducersRef.current) {
                consumeProducer(producerId, clientId);
            }
            pendingProducersRef.current = [];
        }
    };

    const consumeProducer = (producerId: string, clientId: string) => {
        const device = deviceRef.current;
        const transport = recvTransportRef.current;
        if (!device || !transport) {
            console.warn(
                'Device or transport not ready to consume, queueing producer',
                producerId,
            );
            pendingProducersRef.current.push({ producerId, clientId });
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
                    appData: { clientId },
                },
            }),
        );
        producerClientIdMap.current.set(producerId, clientId);
    };

    const producerClientIdMap = useRef<Map<string, string>>(new Map());

    const handleConsumeDone = async (data: any) => {
        const { id, producerId, kind, rtpParameters } = data;
        const clientId =
            producerClientIdMap.current.get(producerId) || 'unknown';
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

        setTracks((prev) => [
            ...prev,
            {
                id: consumer.id,
                producerId,
                kind,
                track: consumer.track,
                clientId,
            },
        ]);

        // If we successfully consumed, the stream is back
        setIsInterrupted(false);

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
                {Object.keys(clientStreams).length === 0 ? (
                    <div className="flex h-full items-center justify-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-500 border-t-white"></div>
                            <span className="text-xs">Connecting...</span>
                        </div>
                    </div>
                ) : (
                    <div
                        className={`grid h-full w-full ${Object.keys(clientStreams).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
                    >
                        {Object.values(clientStreams).map((client) => (
                            <div
                                key={client.clientId}
                                className="relative h-full w-full overflow-hidden"
                            >
                                {client.video ? (
                                    <VideoPlayer
                                        track={client.video.track}
                                        controls={false}
                                        muted={true} // Always muted in card view for now
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center bg-gray-900 text-white">
                                        No Video
                                    </div>
                                )}
                                <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
                                    {client.clientId.slice(0, 6)}
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
                {Object.keys(clientStreams).length === 0 && (
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

                {Object.values(clientStreams).map((client) => (
                    <div
                        key={client.clientId}
                        className={`overflow-hidden rounded-xl bg-white shadow-lg ring-1 transition-all ${
                            activeAudioClientId === client.clientId
                                ? 'ring-2 shadow-blue-500/20 ring-blue-500'
                                : 'ring-gray-200 dark:ring-gray-700'
                        } dark:bg-gray-800`}
                        onClick={() =>
                            setActiveAudioClientId(
                                client.clientId === activeAudioClientId
                                    ? null
                                    : client.clientId,
                            )
                        }
                    >
                        <div className="group relative aspect-video cursor-pointer bg-black">
                            {client.video ? (
                                <VideoPlayer
                                    track={client.video.track}
                                    muted={true} // Video element always muted, we use Audio element for sound
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center text-gray-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <svg
                                            className="h-12 w-12"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={1.5}
                                                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                            />
                                        </svg>
                                        <span>No Video</span>
                                    </div>
                                </div>
                            )}

                            {/* Audio Player (Invisible) */}
                            {client.audio && (
                                <AudioPlayer
                                    track={client.audio.track}
                                    muted={
                                        activeAudioClientId !== client.clientId
                                    }
                                />
                            )}

                            <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                <span className="rounded bg-black/60 px-2 py-1 font-mono text-xs text-white backdrop-blur-sm">
                                    ID: {client.clientId.slice(0, 8)}
                                </span>
                            </div>

                            {/* Audio Indicator */}
                            <div className="absolute top-3 right-3">
                                <div
                                    className={`rounded-full p-2 backdrop-blur-sm transition-colors ${
                                        activeAudioClientId === client.clientId
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-black/40 text-white/70 group-hover:bg-black/60'
                                    }`}
                                >
                                    {activeAudioClientId === client.clientId ? (
                                        <svg
                                            className="h-4 w-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            />
                                        </svg>
                                    ) : (
                                        <svg
                                            className="h-4 w-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                            />
                                        </svg>
                                    )}
                                </div>
                            </div>

                            {isInterrupted && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                                    <div className="flex flex-col items-center gap-2 text-yellow-500">
                                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent"></div>
                                        <span className="font-bold">
                                            Reconnecting...
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Client {client.clientId.slice(0, 4)}
                                </span>
                                <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    {client.video && (
                                        <span className="text-green-500">
                                            Video
                                        </span>
                                    )}
                                    {client.audio && (
                                        <span className="text-blue-500">
                                            Audio
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
