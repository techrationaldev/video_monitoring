import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import {
    Activity,
    BarChart3,
    Clock,
    Maximize2,
    Mic,
    MicOff,
    Play,
    Settings,
    Square,
    Trash2,
    Wifi,
} from 'lucide-react';
import { Device } from 'mediasoup-client';
import { useEffect, useRef, useState } from 'react';

interface Props {
    roomId: string;
}

interface MediaTrack {
    id: string;
    producerId: string;
    kind: 'video' | 'audio';
    track: MediaStreamTrack;
    clientId: string;
    appData?: any;
}

interface ClientStream {
    clientId: string;
    video?: MediaTrack;

    audio?: MediaTrack;
    metadata?: {
        os?: string;
        browser?: string;
        ip?: string;
        source?: string;
    };
}

// Mock Data for Design Matching
const MOCK_CLIPS = [
    {
        id: 'clip_1',
        name: 'session_rec_1001.webm',
        date: 'Today, 10:41 AM',
        size: '12MB',
    },
    {
        id: 'clip_2',
        name: 'session_rec_1002.webm',
        date: 'Today, 10:42 AM',
        size: '14MB',
    },
    {
        id: 'clip_3',
        name: 'session_rec_1003.webm',
        date: 'Today, 10:43 AM',
        size: '12MB',
    },
];

function VideoPlayer({
    track,
    controls = true,
    muted = true,
    className = '',
}: {
    track: MediaStreamTrack;
    controls?: boolean;
    muted?: boolean;
    className?: string;
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
            className={`h-full w-full object-cover ${className}`}
        />
    );
}

function AudioPlayer({
    track,
    muted,
    sinkId,
}: {
    track: MediaStreamTrack;
    muted: boolean;
    sinkId?: string;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (!muted && audioRef.current?.paused) {
            audioRef.current
                .play()
                .catch((e) => console.error('Play failed:', e));
        }
    }, [muted]);

    useEffect(() => {
        if (audioRef.current && track) {
            const stream = new MediaStream([track]);
            audioRef.current.srcObject = stream;
            if (sinkId && 'setSinkId' in audioRef.current) {
                // @ts-ignore
                audioRef.current.setSinkId(sinkId).catch(console.error);
            }
            audioRef.current.play().catch(console.error);
        }
    }, [track, sinkId]);

    return <audio ref={audioRef} autoPlay muted={muted} />;
}

export default function RoomMonitorPage({ roomId }: Props) {
    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Dashboard', href: '/dashboard' },
                { title: `Field Agent ${roomId}`, href: '#' },
            ]}
        >
            <Head title={`Monitor ${roomId}`} />
            <RoomMonitor roomId={roomId} />
        </AppLayout>
    );
}

export function RoomMonitor({
    roomId,
    variant = 'full',
    initialPreferredLayer = 'auto',
}: Props & {
    variant?: 'full' | 'card';
    initialPreferredLayer?: 'auto' | 'high' | 'medium' | 'low';
}) {
    const [tracks, setTracks] = useState<MediaTrack[]>([]);

    // Group tracks
    const clientStreams = tracks.reduce<Record<string, ClientStream>>(
        (acc, track) => {
            if (!acc[track.clientId]) {
                acc[track.clientId] = { clientId: track.clientId };
            }
            if (track.kind === 'video') acc[track.clientId].video = track;

            if (track.kind === 'audio') acc[track.clientId].audio = track;
            if (track.appData) {
                console.log(
                    `[ADMIN] Track ${track.id} has appData:`,
                    track.appData,
                );
                acc[track.clientId].metadata = {
                    ...acc[track.clientId].metadata,
                    ...track.appData,
                };
            }
            return acc;
        },
        {},
    );

    // WebRTC Refs
    const deviceRef = useRef<Device | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const recvTransportRef = useRef<any>(null);
    const sendTransportRef = useRef<any>(null);
    const audioProducerRef = useRef<any>(null);
    const consumersRef = useRef<Map<string, any>>(new Map());
    const pendingProducersRef = useRef<
        { producerId: string; clientId: string }[]
    >([]);
    const producerClientIdMap = useRef<Map<string, string>>(new Map());
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
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioOutputDevices, setAudioOutputDevices] = useState<
        MediaDeviceInfo[]
    >([]);
    const [selectedAudioDeviceId, setSelectedAudioDeviceId] =
        useState<string>('');
    const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] =
        useState<string>('');
    const [showSettings, setShowSettings] = useState(false);
    const [isTalking, setIsTalking] = useState(false);
    const [uptime, setUptime] = useState('00:00:00');
    const [streamMetrics, setStreamMetrics] = useState({
        bitrate: 0,
        latency: 0,
        fps: 0,
        resolution: 'N/A',
    });
    const [networkQuality, setNetworkQuality] = useState<
        'Excellent' | 'Good' | 'Poor'
    >('Excellent');
    const [preferredLayer, setPreferredLayer] = useState<
        'auto' | 'high' | 'medium' | 'low'
    >(initialPreferredLayer);
    const [recordings, setRecordings] = useState(MOCK_CLIPS);

    const lastStatsRef = useRef<
        Map<string, { timestamp: number; bytes: number }>
    >(new Map());

    // Real Stream Stats
    useEffect(() => {
        const interval = setInterval(async () => {
            let totalBitrate = 0;
            let maxLatency = 0;
            let fps = 0;
            let resolution = 'N/A';
            const now = Date.now();

            for (const consumer of consumersRef.current.values()) {
                try {
                    const stats = await consumer.getStats();
                    stats.forEach((report: any) => {
                        if (report.type === 'inbound-rtp') {
                            const bytes = report.bytesReceived;
                            const last = lastStatsRef.current.get(consumer.id);
                            if (last) {
                                const duration = now - last.timestamp;
                                if (duration > 0) {
                                    const bits = (bytes - last.bytes) * 8;
                                    const bitrate = bits / (duration / 1000); // bps
                                    totalBitrate += bitrate;
                                }
                            }
                            lastStatsRef.current.set(consumer.id, {
                                timestamp: now,
                                bytes,
                            });

                            if (report.kind === 'video') {
                                fps = report.framesPerSecond || 0;
                            }
                        }
                        if (
                            report.type === 'candidate-pair' &&
                            report.state === 'succeeded'
                        ) {
                            maxLatency =
                                report.currentRoundTripTime * 1000 || 0;
                        }
                    });
                } catch (e) {
                    console.error('Failed to get stats:', e);
                }
            }

            // Get resolution from track settings
            const mainVideoTrack =
                Object.values(clientStreams)[0]?.video?.track;
            if (mainVideoTrack) {
                const settings = mainVideoTrack.getSettings();
                if (settings.width && settings.height) {
                    resolution = `${settings.width}x${settings.height}`;
                }
            }

            setStreamMetrics({
                bitrate: parseFloat((totalBitrate / 1000000).toFixed(2)), // Mbps
                latency: Math.round(maxLatency),
                fps: Math.round(fps),
                resolution: resolution !== 'N/A' ? resolution : '720p', // Fallback
            });

            if (maxLatency < 100) setNetworkQuality('Excellent');
            else if (maxLatency < 300) setNetworkQuality('Good');
            else setNetworkQuality('Poor');
        }, 1000);

        return () => clearInterval(interval);
    }, [clientStreams]);

    // Uptime Timer
    useEffect(() => {
        const start = Date.now();
        const interval = setInterval(() => {
            const diff = Date.now() - start;
            const h = Math.floor(diff / 3600000)
                .toString()
                .padStart(2, '0');
            const m = Math.floor((diff % 3600000) / 60000)
                .toString()
                .padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000)
                .toString()
                .padStart(2, '0');
            setUptime(`${h}:${m}:${s}`);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // --- WebRTC Logic (Condensed) ---
    useEffect(() => {
        const getDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(
                    (d) => d.kind === 'audioinput',
                );
                const audioOutputs = devices.filter(
                    (d) => d.kind === 'audiooutput',
                );

                setAudioDevices(audioInputs);
                setAudioOutputDevices(audioOutputs);

                if (audioInputs.length > 0 && !selectedAudioDeviceId) {
                    setSelectedAudioDeviceId(audioInputs[0].deviceId);
                }
                if (audioOutputs.length > 0 && !selectedAudioOutputDeviceId) {
                    setSelectedAudioOutputDeviceId(audioOutputs[0].deviceId);
                }
            } catch (e) {
                console.error('Failed to enumerate devices:', e);
            }
        };
        getDevices();
    }, []);

    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimeout: NodeJS.Timeout;

        const connect = () => {
            const wsUrl =
                import.meta.env.VITE_MEDIASOUP_WS_URL || 'ws://localhost:5005';
            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[ADMIN] Connected');
                setConnectionStatus('connected');
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
                    case 'create-send-transport':
                        await createSendTransport(data);
                        break;
                    case 'existing-producers':
                        for (const producer of data)
                            consumeProducer(producer.id, producer.clientId);
                        break;
                    case 'new-producer':
                        consumeProducer(data.producerId, data.clientId);
                        break;
                    case 'producer-closed':
                        setTracks((prev) =>
                            prev.filter(
                                (s) => s.producerId !== data.producerId,
                            ),
                        );
                        break;
                    case 'consume-done':
                        await handleConsumeDone(data);
                        break;
                    case 'session-ended':
                        window.location.reload();
                        break;
                }
            };

            ws.onclose = () => {
                console.log('[ADMIN] Disconnected');
                setConnectionStatus('reconnecting');
                reconnectTimeout = setTimeout(connect, 3000);
            };
        };

        connect();
        return () => {
            ws?.close();
            clearTimeout(reconnectTimeout);
        };
    }, [roomId]);

    const loadDevice = async (routerRtpCapabilities: any) => {
        try {
            const device = new Device();
            await device.load({ routerRtpCapabilities });
            deviceRef.current = device;
        } catch (error) {
            console.error('Failed to load device:', error);
        }
    };

    const createRecvTransport = async (transportData: any) => {
        const device = deviceRef.current;
        if (!device) return;
        const transport = device.createRecvTransport(transportData);
        recvTransportRef.current = transport;

        transport.on('connect', ({ dtlsParameters }, callback) => {
            wsRef.current?.send(
                JSON.stringify({
                    action: 'connect-transport',
                    roomId,
                    clientId: clientIdRef.current,
                    data: { transportId: transport.id, dtlsParameters },
                }),
            );
            callback();
        });

        if (pendingProducersRef.current.length > 0) {
            for (const {
                producerId,
                clientId,
            } of pendingProducersRef.current) {
                consumeProducer(producerId, clientId);
            }
            pendingProducersRef.current = [];
        }
    };

    const createSendTransport = async (transportData: any) => {
        const device = deviceRef.current;
        if (!device) return;
        const transport = device.createSendTransport(transportData);
        sendTransportRef.current = transport;

        transport.on('connect', ({ dtlsParameters }, callback) => {
            wsRef.current?.send(
                JSON.stringify({
                    action: 'connect-transport',
                    roomId,
                    clientId: clientIdRef.current,
                    data: { transportId: transport.id, dtlsParameters },
                }),
            );
            callback();
        });

        transport.on('produce', ({ kind, rtpParameters }, callback) => {
            wsRef.current?.send(
                JSON.stringify({
                    action: 'produce',
                    roomId,
                    clientId: clientIdRef.current,
                    data: { transportId: transport.id, kind, rtpParameters },
                }),
            );

            const handleProduceDone = (event: MessageEvent) => {
                const msg = JSON.parse(event.data);
                if (msg.action === 'produce-done') {
                    callback({ id: msg.producerId });
                    wsRef.current?.removeEventListener(
                        'message',
                        handleProduceDone,
                    );
                }
            };
            wsRef.current?.addEventListener('message', handleProduceDone);
        });
    };

    const consumeProducer = (producerId: string, clientId: string) => {
        const device = deviceRef.current;
        const transport = recvTransportRef.current;
        if (!device || !transport) {
            pendingProducersRef.current.push({ producerId, clientId });
            return;
        }
        wsRef.current?.send(
            JSON.stringify({
                action: 'consume',
                roomId,
                clientId: clientIdRef.current,
                data: {
                    transportId: transport.id,
                    producerId,
                    rtpCapabilities: device.rtpCapabilities,
                    appData: { clientId },
                },
            }),
        );
        producerClientIdMap.current.set(producerId, clientId);
    };

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

        setTracks((prev) => {
            // Check if we already have this track
            if (prev.some((t) => t.id === consumer.id)) return prev;

            const newTrack = {
                id: consumer.id,
                producerId,
                kind,
                track: consumer.track,
                clientId,
                appData: data.appData, // Store appData with the track
            };
            return [...prev, newTrack];
        });

        // Update client metadata if available
        if (data.appData) {
            // We need a way to store metadata separately or attach it to the client stream object
            // Since clientStreams is derived from tracks, we can attach it to the track object
            // and then extract it in the reducer.
        }
    };

    const startTalking = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: selectedAudioDeviceId
                    ? { deviceId: { exact: selectedAudioDeviceId } }
                    : true,
            });
            const track = stream.getAudioTracks()[0];

            if (!sendTransportRef.current) {
                wsRef.current?.send(
                    JSON.stringify({
                        action: 'create-send-transport',
                        roomId,
                        clientId: clientIdRef.current,
                    }),
                );
                setTimeout(async () => {
                    if (sendTransportRef.current) {
                        audioProducerRef.current =
                            await sendTransportRef.current.produce({ track });
                        setIsTalking(true);
                    }
                }, 1000);
            } else {
                audioProducerRef.current =
                    await sendTransportRef.current.produce({ track });
                setIsTalking(true);
            }
        } catch (err) {
            console.error('Failed to start talking:', err);
        }
    };

    const stopTalking = () => {
        if (audioProducerRef.current) {
            wsRef.current?.send(
                JSON.stringify({
                    action: 'close-producer',
                    roomId,
                    clientId: clientIdRef.current,
                    data: { producerId: audioProducerRef.current.id },
                }),
            );
            audioProducerRef.current.close();
            audioProducerRef.current = null;
            setIsTalking(false);
        }
    };

    const changeResolution = (layer: 'auto' | 'high' | 'medium' | 'low') => {
        setPreferredLayer(layer);

        // Find video consumer
        const videoTrack = Object.values(clientStreams)[0]?.video;
        if (!videoTrack) return;

        // Map layer to spatial/temporal
        let spatialLayer = 2; // High
        let temporalLayer = 2; // High

        if (layer === 'medium') {
            spatialLayer = 1;
        } else if (layer === 'low') {
            spatialLayer = 0;
        }

        // Send to server
        console.log(`[ADMIN] Sending set-consumer-preferred-layers:`, {
            consumerId: videoTrack.id,
            spatialLayer,
            temporalLayer,
        });
        wsRef.current?.send(
            JSON.stringify({
                action: 'set-consumer-preferred-layers',
                roomId,
                clientId: clientIdRef.current,
                data: {
                    consumerId: videoTrack.id,
                    spatialLayer,
                    temporalLayer,
                },
            }),
        );
    };

    // --- Render ---

    if (variant === 'card') {
        return (
            <div className="relative h-full w-full bg-black">
                {Object.keys(clientStreams).length === 0 ? (
                    <div className="flex h-full items-center justify-center text-zinc-500">
                        <span className="text-xs">Connecting...</span>
                    </div>
                ) : (
                    <div className="grid h-full w-full grid-cols-1">
                        {Object.values(clientStreams).map((client) => (
                            <div
                                key={client.clientId}
                                className="relative h-full w-full overflow-hidden"
                            >
                                {client.video && (
                                    <VideoPlayer
                                        track={client.video.track}
                                        controls={false}
                                        muted={true}
                                    />
                                )}

                                {/* Overlays */}
                                <div className="absolute inset-0 flex flex-col justify-between p-3">
                                    {/* Top Row */}
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-1.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                                            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-white"></div>
                                            REC
                                        </div>
                                        <div className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                            {streamMetrics.resolution !== 'N/A'
                                                ? streamMetrics.resolution.split(
                                                      'x',
                                                  )[1] + 'p'
                                                : '720p'}
                                        </div>
                                    </div>

                                    {/* Bottom Row */}
                                    <div className="flex items-end justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-white drop-shadow-md">
                                                Field Agent {roomId}
                                            </span>
                                            <span className="text-[10px] font-medium text-zinc-300 drop-shadow-md">
                                                client-
                                                {client.clientId.slice(0, 4)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-green-400 drop-shadow-md">
                                            <BarChart3 className="h-3 w-3" />
                                            <span>
                                                {Math.round(
                                                    streamMetrics.bitrate *
                                                        1000,
                                                )}
                                                kbps
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Get the first active client for the main view (Focus Mode)
    const mainClient = Object.values(clientStreams)[0];

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-zinc-950 text-zinc-100">
            {/* Main Content Area */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-3">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <span className="font-medium text-white">{roomId}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700">
                            <Square className="h-3 w-3 fill-current" />
                            STOP RECORDING
                        </button>
                        <div className="relative">
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className={`rounded p-1.5 hover:bg-zinc-800 hover:text-white ${showSettings ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
                            >
                                <Settings className="h-4 w-4" />
                            </button>

                            {/* Settings Popup */}
                            {showSettings && (
                                <div className="absolute top-full right-0 z-50 mt-2 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
                                    <h3 className="mb-3 text-sm font-medium text-white">
                                        Audio Settings
                                    </h3>

                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-zinc-400">
                                                Microphone
                                            </label>
                                            <select
                                                value={selectedAudioDeviceId}
                                                onChange={(e) =>
                                                    setSelectedAudioDeviceId(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full rounded bg-zinc-800 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                            >
                                                {audioDevices.map((device) => (
                                                    <option
                                                        key={device.deviceId}
                                                        value={device.deviceId}
                                                    >
                                                        {device.label ||
                                                            `Microphone ${device.deviceId.slice(0, 5)}...`}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {audioOutputDevices.length > 0 && (
                                            <div className="space-y-1.5">
                                                <label className="text-xs text-zinc-400">
                                                    Speaker
                                                </label>
                                                <select
                                                    value={
                                                        selectedAudioOutputDeviceId
                                                    }
                                                    onChange={(e) =>
                                                        setSelectedAudioOutputDeviceId(
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="w-full rounded bg-zinc-800 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-500"
                                                >
                                                    {audioOutputDevices.map(
                                                        (device) => (
                                                            <option
                                                                key={
                                                                    device.deviceId
                                                                }
                                                                value={
                                                                    device.deviceId
                                                                }
                                                            >
                                                                {device.label ||
                                                                    `Speaker ${device.deviceId.slice(0, 5)}...`}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Video Area */}
                <div className="flex-1 overflow-hidden bg-black p-4">
                    <div className="relative h-full w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                        {mainClient?.video ? (
                            <VideoPlayer
                                track={mainClient.video.track}
                                controls={false}
                                muted={true}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-zinc-600">
                                <div className="flex flex-col items-center gap-2">
                                    <Wifi className="h-12 w-12 opacity-20" />
                                    <span>Waiting for stream...</span>
                                </div>
                            </div>
                        )}

                        {/* Audio (Hidden) */}
                        {mainClient?.audio && (
                            <AudioPlayer
                                track={mainClient.audio.track}
                                muted={false}
                                sinkId={selectedAudioOutputDeviceId}
                            />
                        )}

                        {/* Overlays */}
                        <div className="absolute inset-0 flex flex-col justify-between p-6">
                            <div className="flex justify-end">
                                <div
                                    className={`flex items-center gap-2 rounded bg-black/50 px-3 py-1.5 backdrop-blur-md ${connectionStatus === 'connected' ? 'text-green-500' : 'text-red-500'}`}
                                >
                                    <Wifi
                                        className={`h-4 w-4 ${
                                            networkQuality === 'Excellent'
                                                ? 'text-green-500'
                                                : networkQuality === 'Good'
                                                  ? 'text-yellow-500'
                                                  : 'text-red-500'
                                        }`}
                                    />
                                </div>
                            </div>

                            <div className="flex items-end justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-white shadow-black drop-shadow-md">
                                        Field Agent {roomId}
                                    </h2>
                                    <div className="mt-1 flex items-center gap-4 text-sm font-medium text-zinc-300 shadow-black drop-shadow-md">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="h-4 w-4" />
                                            <span>{uptime} uptime</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-green-400">
                                            <Activity className="h-4 w-4" />
                                            <span>
                                                {streamMetrics.resolution}{' '}
                                                {streamMetrics.fps}fps
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onMouseDown={startTalking}
                                        onMouseUp={stopTalking}
                                        onMouseLeave={stopTalking}
                                        className={`flex items-center gap-2 rounded-lg px-6 py-2.5 font-bold text-white transition-all ${
                                            isTalking
                                                ? 'bg-indigo-600 shadow-[0_0_20px_rgba(79,70,229,0.5)]'
                                                : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                    >
                                        {isTalking ? (
                                            <Mic className="h-4 w-4 animate-pulse" />
                                        ) : (
                                            <MicOff className="h-4 w-4" />
                                        )}
                                        {isTalking
                                            ? 'Speaking...'
                                            : 'Talk Back'}
                                    </button>
                                    <button className="rounded-lg bg-black/50 p-2.5 text-white backdrop-blur-md hover:bg-black/70">
                                        <Maximize2 className="h-5 w-5" />
                                    </button>

                                    {/* Resolution Selector */}
                                    <select
                                        value={preferredLayer}
                                        onChange={(e) =>
                                            changeResolution(
                                                e.target.value as any,
                                            )
                                        }
                                        className="cursor-pointer rounded-lg border-none bg-black/50 p-2.5 text-xs text-white backdrop-blur-md outline-none hover:bg-black/70"
                                    >
                                        <option value="auto">Auto</option>
                                        <option value="high">720p</option>
                                        <option value="medium">480p</option>
                                        <option value="low">240p</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Info Panel */}
            <div className="flex w-80 flex-col border-l border-zinc-800 bg-zinc-900">
                {/* Stream Health */}
                <div className="border-b border-zinc-800 p-4">
                    <h3 className="mb-4 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                        Stream Health
                    </h3>
                    <div className="mb-4 h-24 w-full rounded bg-zinc-900/50 p-2">
                        {/* Mock Graph */}
                        <svg
                            className="h-full w-full"
                            viewBox="0 0 100 40"
                            preserveAspectRatio="none"
                        >
                            <path
                                d="M0 35 Q 10 30, 20 32 T 40 25 T 60 28 T 80 20 T 100 22"
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="2"
                                vectorEffect="non-scaling-stroke"
                            />
                            <path
                                d="M0 35 Q 10 30, 20 32 T 40 25 T 60 28 T 80 20 T 100 22 V 40 H 0 Z"
                                fill="url(#gradient)"
                                opacity="0.2"
                            />
                            <defs>
                                <linearGradient
                                    id="gradient"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop offset="0%" stopColor="#10b981" />
                                    <stop
                                        offset="100%"
                                        stopColor="#10b981"
                                        stopOpacity="0"
                                    />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="rounded bg-zinc-800/50 p-3">
                            <div className="text-xs text-zinc-500">Bitrate</div>
                            <div className="font-mono text-sm font-medium text-green-400">
                                {streamMetrics.bitrate} Mbps
                            </div>
                        </div>
                        <div className="rounded bg-zinc-800/50 p-3">
                            <div className="text-xs text-zinc-500">Latency</div>
                            <div className="font-mono text-sm font-medium text-zinc-300">
                                {streamMetrics.latency} ms
                            </div>
                        </div>
                    </div>
                </div>

                {/* Source Info */}
                <div className="border-b border-zinc-800 p-4">
                    <h3 className="mb-4 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                        Source Info
                    </h3>
                    <div className="space-y-3 text-sm">
                        {mainClient?.metadata && (
                            <>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">OS</span>
                                    <span className="text-zinc-300">
                                        {mainClient.metadata.os || 'Unknown'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">
                                        Browser
                                    </span>
                                    <span className="text-zinc-300">
                                        {mainClient.metadata.browser ||
                                            'Unknown'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">IP</span>
                                    <span className="font-mono text-zinc-300">
                                        {mainClient.metadata.ip || 'Unknown'}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Recent Clips */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
                            Recent Clips (53)
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {recordings.map((clip) => (
                            <div
                                key={clip.id}
                                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800/30 p-2 transition-colors hover:border-zinc-700 hover:bg-zinc-800"
                            >
                                <button className="flex h-8 w-8 items-center justify-center rounded bg-zinc-800 text-indigo-400 hover:bg-indigo-600 hover:text-white">
                                    <Play className="h-3 w-3 fill-current" />
                                </button>
                                <div className="flex-1 overflow-hidden">
                                    <div className="truncate text-xs font-medium text-zinc-300">
                                        {clip.name}
                                    </div>
                                    <div className="text-[10px] text-zinc-500">
                                        {clip.date} • {clip.size}
                                    </div>
                                </div>
                                <button
                                    onClick={() =>
                                        setRecordings((prev) =>
                                            prev.filter(
                                                (r) => r.id !== clip.id,
                                            ),
                                        )
                                    }
                                    className="text-zinc-500 hover:text-red-400"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-800 p-4">
                    <button className="w-full rounded bg-zinc-800 py-3 text-xs font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white">
                        TERMINATE SESSION
                    </button>
                </div>
            </div>
        </div>
    );
}
