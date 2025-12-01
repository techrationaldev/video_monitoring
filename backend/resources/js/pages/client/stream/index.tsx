import StreamSetup from '@/components/StreamSetup';
import { ClientWebRTC } from '@/lib/webrtc/client';
import axios from 'axios';
import {
    Activity,
    Camera,
    CameraOff,
    Mic,
    MicOff,
    PhoneOff,
    Settings,
    Signal,
    Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export default function ClientStreamPage() {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const [connected, setConnected] = useState(false);
    const [viewerCount, setViewerCount] = useState(0);
    const [isSetup, setIsSetup] = useState(false);
    const [isEnded, setIsEnded] = useState(false);
    const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
    const [clientRef, setClientRef] = useState<ClientWebRTC | null>(null);

    // Controls State
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [showSettings, setShowSettings] = useState(false);

    // Admin Talkback State
    const [remoteAudioTrack, setRemoteAudioTrack] =
        useState<MediaStreamTrack | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);

    // Device State
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioOutputDevices, setAudioOutputDevices] = useState<
        MediaDeviceInfo[]
    >([]);
    const [selectedVideoDeviceId, setSelectedVideoDeviceId] =
        useState<string>('');
    const [selectedAudioDeviceId, setSelectedAudioDeviceId] =
        useState<string>('');
    const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] =
        useState<string>('');

    // Session Timer
    const [sessionDuration, setSessionDuration] = useState(0);
    const [networkQuality, setNetworkQuality] = useState<
        'Excellent' | 'Good' | 'Poor'
    >('Excellent');

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (connected) {
            interval = setInterval(() => {
                setSessionDuration((prev) => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [connected]);

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m
            .toString()
            .padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        const getDevices = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = devices.filter(
                    (d) => d.kind === 'videoinput',
                );
                const audioInputs = devices.filter(
                    (d) => d.kind === 'audioinput',
                );
                const audioOutputs = devices.filter(
                    (d) => d.kind === 'audiooutput',
                );
                setVideoDevices(videoInputs);
                setAudioDevices(audioInputs);
                setAudioOutputDevices(audioOutputs);

                // Set initial selection based on current stream if possible, or defaults
                if (videoInputs.length > 0 && !selectedVideoDeviceId)
                    setSelectedVideoDeviceId(videoInputs[0].deviceId);
                if (audioInputs.length > 0 && !selectedAudioDeviceId)
                    setSelectedAudioDeviceId(audioInputs[0].deviceId);
                if (audioOutputs.length > 0 && !selectedAudioOutputDeviceId)
                    setSelectedAudioOutputDeviceId(audioOutputs[0].deviceId);
            } catch (e) {
                console.error('[PAGE] Failed to enumerate devices:', e);
            }
        };
        getDevices();
        navigator.mediaDevices.addEventListener('devicechange', getDevices);
        return () =>
            navigator.mediaDevices.removeEventListener(
                'devicechange',
                getDevices,
            );
    }, []);

    const handleStreamReady = (
        stream: MediaStream,
        video: boolean,
        audio: boolean,
    ) => {
        setMediaStream(stream);
        setVideoEnabled(video);
        setAudioEnabled(audio);
        setIsSetup(true);
        startStreaming(stream);
    };

    const startStreaming = (stream: MediaStream) => {
        let roomId = localStorage.getItem('stream_room_id');
        if (!roomId) {
            roomId = `client-${Date.now()}`;
            localStorage.setItem('stream_room_id', roomId);
        }

        let connectionId = sessionStorage.getItem(
            `stream_connection_id_${roomId}`,
        );
        if (!connectionId) {
            connectionId = crypto.randomUUID();
            sessionStorage.setItem(
                `stream_connection_id_${roomId}`,
                connectionId,
            );
        }

        axios
            .post(`/api/rooms/${roomId}/join`, { connection_id: connectionId })
            .then(() => {
                console.log('[PAGE] Session created in DB');
                const client = new ClientWebRTC(
                    import.meta.env.VITE_MEDIASOUP_WS_URL ||
                        'ws://localhost:5005',
                    roomId!,
                    connectionId!,
                );
                setClientRef(client);

                // Handle incoming tracks (Admin Talkback)
                client.onTrack((track) => {
                    console.log(
                        '[PAGE] Received remote track:',
                        track.kind,
                        track.id,
                    );
                    if (track.kind === 'audio') {
                        setRemoteAudioTrack(track);
                    }
                });

                client.onTrackEnded((trackId) => {
                    console.log('[PAGE] Track ended:', trackId);
                    setRemoteAudioTrack((current) => {
                        if (current && current.id === trackId) {
                            return null;
                        }
                        return current;
                    });
                });

                client.init().then(() => {
                    client.onMessage(async (msg) => {
                        if (msg.action === 'router-rtp-capabilities') {
                            await client.loadDevice(msg.data);
                        }
                        if (
                            msg.action === 'create-send-transport' &&
                            msg.data
                        ) {
                            await client.createSendTransport(msg.data);
                        }
                        if (msg.action === 'start-produce') {
                            // Gather Metadata
                            const ua = navigator.userAgent;
                            let os = 'Unknown OS';
                            if (ua.indexOf('Win') !== -1) os = 'Windows';
                            if (ua.indexOf('Mac') !== -1) os = 'macOS';
                            if (ua.indexOf('Linux') !== -1) os = 'Linux';
                            if (ua.indexOf('Android') !== -1) os = 'Android';
                            if (ua.indexOf('like Mac') !== -1) os = 'iOS';

                            let browser = 'Unknown Browser';
                            if (ua.indexOf('Chrome') !== -1) browser = 'Chrome';
                            if (ua.indexOf('Firefox') !== -1)
                                browser = 'Firefox';
                            if (
                                ua.indexOf('Safari') !== -1 &&
                                ua.indexOf('Chrome') === -1
                            )
                                browser = 'Safari';
                            if (ua.indexOf('Edge') !== -1) browser = 'Edge';

                            const metadata = {
                                os,
                                browser,
                                ip: '127.0.0.1', // Placeholder, real IP needs server-side extraction
                            };

                            await client.produceStream(stream, metadata);
                            setConnected(true);
                        }
                        if (msg.action === 'viewer-count') {
                            setViewerCount(msg.count);
                        }
                        if (msg.action === 'session-ended') {
                            console.warn(
                                '[PAGE] Session ended by server, reloading...',
                            );
                            window.location.reload();
                        }
                        if (msg.action === 'admin-action') {
                            if (client) {
                                client.handleAdminAction(
                                    msg.data.type,
                                    msg.data.payload,
                                );
                            }
                        }
                    });
                });
            })
            .catch((err) =>
                console.error('[PAGE] Failed to join room API:', err),
            );
    };

    // Network Quality Monitoring
    useEffect(() => {
        if (!connected || !clientRef) return;

        const interval = setInterval(async () => {
            // @ts-ignore
            if (clientRef.sendTransport) {
                // @ts-ignore
                const stats = await clientRef.sendTransport.getStats();
                let rtt = 0;
                let packetLoss = 0;

                stats.forEach((report: any) => {
                    if (
                        report.type === 'candidate-pair' &&
                        report.state === 'succeeded'
                    ) {
                        rtt = report.currentRoundTripTime * 1000;
                    }
                    if (
                        report.type === 'outbound-rtp' &&
                        report.kind === 'video'
                    ) {
                        // Simple packet loss estimation if available
                    }
                });

                if (rtt < 100) setNetworkQuality('Excellent');
                else if (rtt < 300) setNetworkQuality('Good');
                else setNetworkQuality('Poor');
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [connected, clientRef]);

    useEffect(() => {
        if (localVideoRef.current && mediaStream) {
            localVideoRef.current.srcObject = mediaStream;
        }
    }, [mediaStream, connected]);

    // Effect to play remote audio
    useEffect(() => {
        if (remoteAudioRef.current && remoteAudioTrack) {
            console.log('[PAGE] Playing remote audio track');
            const stream = new MediaStream([remoteAudioTrack]);
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current
                .play()
                .catch((e) =>
                    console.error('[PAGE] Remote audio play failed:', e),
                );
        }
    }, [remoteAudioTrack]);

    // Handle Live Toggles
    const toggleAudio = () => {
        if (!clientRef) return;
        if (audioEnabled) {
            clientRef.muteAudio();
        } else {
            clientRef.unmuteAudio();
        }
        setAudioEnabled(!audioEnabled);
    };

    const toggleVideo = () => {
        if (!clientRef) return;
        if (videoEnabled) {
            clientRef.pauseVideo();
        } else {
            clientRef.resumeVideo();
        }
        setVideoEnabled(!videoEnabled);
    };

    const switchCamera = async (deviceId: string) => {
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: deviceId } },
            });
            const newTrack = newStream.getVideoTracks()[0];

            if (clientRef) {
                await clientRef.replaceVideoTrack(newTrack);
            }

            // Update local video
            if (mediaStream) {
                const oldTrack = mediaStream.getVideoTracks()[0];
                if (oldTrack) {
                    mediaStream.removeTrack(oldTrack);
                    oldTrack.stop();
                }
                mediaStream.addTrack(newTrack);
                // Force update local video srcObject
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = mediaStream;
                }
            }

            setSelectedVideoDeviceId(deviceId);
            setVideoEnabled(true); // Ensure video is enabled after switch
        } catch (e) {
            console.error('[PAGE] Failed to switch camera:', e);
        }
    };

    const switchMicrophone = async (deviceId: string) => {
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: deviceId } },
            });
            const newTrack = newStream.getAudioTracks()[0];

            if (clientRef) {
                await clientRef.replaceAudioTrack(newTrack);
            }

            // Update local stream (though audio isn't played locally usually)
            if (mediaStream) {
                const oldTrack = mediaStream.getAudioTracks()[0];
                if (oldTrack) {
                    mediaStream.removeTrack(oldTrack);
                    oldTrack.stop();
                }
                mediaStream.addTrack(newTrack);
            }

            setSelectedAudioDeviceId(deviceId);
            setAudioEnabled(true);
        } catch (e) {
            console.error('[PAGE] Failed to switch microphone:', e);
        }
    };

    const changeAudioOutput = async (deviceId: string) => {
        try {
            if (
                remoteAudioRef.current &&
                'setSinkId' in remoteAudioRef.current
            ) {
                // @ts-ignore
                await remoteAudioRef.current.setSinkId(deviceId);
                setSelectedAudioOutputDeviceId(deviceId);
            } else {
                console.warn('Audio output selection not supported');
            }
        } catch (e) {
            console.error('Failed to set audio output device:', e);
        }
    };

    const endStream = () => {
        if (confirm('Are you sure you want to end the stream?')) {
            if (clientRef) {
                clientRef.close();
            }

            // Stop local tracks
            if (mediaStream) {
                mediaStream.getTracks().forEach((track) => track.stop());
            }

            setConnected(false);
            setIsEnded(true);
        }
    };

    if (isEnded) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
                <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center shadow-2xl">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
                        <PhoneOff className="h-10 w-10 text-red-500" />
                    </div>
                    <h2 className="mb-2 text-3xl font-bold text-white">
                        Stream Ended
                    </h2>
                    <p className="mb-8 text-zinc-400">
                        The streaming session has been terminated successfully.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
                    >
                        Start New Stream
                    </button>
                </div>
            </div>
        );
    }

    if (!isSetup) {
        return <StreamSetup onReady={handleStreamReady} />;
    }

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
            {/* Main Video Feed */}
            <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`h-full w-full object-contain ${!videoEnabled ? 'opacity-0' : ''}`}
            />

            {!videoEnabled && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90">
                    <CameraOff className="mb-4 h-16 w-16 text-zinc-600" />
                    <span className="text-xl font-medium text-zinc-400">
                        Camera Paused
                    </span>
                </div>
            )}

            {/* Header Overlay */}
            <div className="pointer-events-none absolute top-0 right-0 left-0 flex items-start justify-between bg-gradient-to-b from-black/80 to-transparent p-6">
                <div className="pointer-events-auto flex items-center gap-4">
                    <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 backdrop-blur-md">
                        {connected ? (
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
                                </span>
                                <span className="text-xs font-bold tracking-wider text-red-500">
                                    LIVE
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-yellow-500"></span>
                                <span className="text-xs font-bold tracking-wider text-yellow-500">
                                    CONNECTING
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 font-mono text-sm text-zinc-300 backdrop-blur-md">
                        {formatDuration(sessionDuration)}
                    </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-3">
                    <div className="flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1.5 backdrop-blur-md">
                        <Signal className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-xs font-medium text-green-500">
                            {networkQuality}
                        </span>
                    </div>
                </div>
            </div>

            {/* Client ID Label */}
            <div className="pointer-events-none absolute bottom-28 left-6">
                <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 py-2 backdrop-blur-md">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold">
                        YOU
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">
                            Client Stream
                        </span>
                        <span className="font-mono text-xs text-zinc-400">
                            {localStorage.getItem('stream_room_id')}
                        </span>
                    </div>
                    <div className="mx-1 h-4 w-[1px] bg-zinc-700"></div>
                    <Activity className="h-4 w-4 text-green-500" />
                </div>
            </div>

            {/* Remote Audio Player & Indicator */}
            <audio ref={remoteAudioRef} autoPlay />
            {remoteAudioTrack && (
                <div className="pointer-events-auto absolute top-24 right-6 animate-in duration-300 fade-in slide-in-from-right">
                    <div className="flex animate-pulse items-center gap-3 rounded-lg bg-red-500 px-4 py-2 text-white shadow-lg">
                        <Volume2 className="h-5 w-5" />
                        <span className="text-sm font-bold">
                            Admin Speaking...
                        </span>
                    </div>
                </div>
            )}

            {/* Bottom Controls Bar */}
            <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-2 shadow-2xl backdrop-blur-xl">
                <button
                    onClick={toggleAudio}
                    className={`rounded-xl p-3.5 transition-all duration-200 ${
                        audioEnabled
                            ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                            : 'border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                    }`}
                    title={audioEnabled ? 'Mute Mic' : 'Unmute Mic'}
                >
                    {audioEnabled ? (
                        <Mic className="h-5 w-5" />
                    ) : (
                        <MicOff className="h-5 w-5" />
                    )}
                </button>

                <button
                    onClick={toggleVideo}
                    className={`rounded-xl p-3.5 transition-all duration-200 ${
                        videoEnabled
                            ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                            : 'border border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                    }`}
                    title={videoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                >
                    {videoEnabled ? (
                        <Camera className="h-5 w-5" />
                    ) : (
                        <CameraOff className="h-5 w-5" />
                    )}
                </button>

                <div className="mx-1 h-8 w-[1px] bg-zinc-800"></div>

                <div className="relative">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`rounded-xl p-3.5 transition-all duration-200 ${
                            showSettings
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-800 text-white hover:bg-zinc-700'
                        }`}
                        title="Settings"
                    >
                        <Settings className="h-5 w-5" />
                    </button>

                    {/* Settings Popover */}
                    {showSettings && (
                        <div className="absolute bottom-full left-1/2 mb-4 w-72 -translate-x-1/2 animate-in rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl duration-200 zoom-in-95">
                            <h3 className="mb-3 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                                Device Settings
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="mb-1.5 block text-xs text-zinc-400">
                                        Camera
                                    </label>
                                    <select
                                        value={selectedVideoDeviceId}
                                        onChange={(e) =>
                                            switchCamera(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-white outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                                    >
                                        {videoDevices.map((device) => (
                                            <option
                                                key={device.deviceId}
                                                value={device.deviceId}
                                            >
                                                {device.label ||
                                                    `Camera ${device.deviceId.slice(0, 5)}...`}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="mb-1.5 block text-xs text-zinc-400">
                                        Microphone
                                    </label>
                                    <select
                                        value={selectedAudioDeviceId}
                                        onChange={(e) =>
                                            switchMicrophone(e.target.value)
                                        }
                                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-white outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                                    >
                                        {audioDevices.map((device) => (
                                            <option
                                                key={device.deviceId}
                                                value={device.deviceId}
                                            >
                                                {device.label ||
                                                    `Mic ${device.deviceId.slice(0, 5)}...`}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {audioOutputDevices.length > 0 && (
                                    <div>
                                        <label className="mb-1.5 block text-xs text-zinc-400">
                                            Speaker
                                        </label>
                                        <select
                                            value={selectedAudioOutputDeviceId}
                                            onChange={(e) =>
                                                changeAudioOutput(
                                                    e.target.value,
                                                )
                                            }
                                            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-white outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                                        >
                                            {audioOutputDevices.map(
                                                (device) => (
                                                    <option
                                                        key={device.deviceId}
                                                        value={device.deviceId}
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

                <button
                    onClick={endStream}
                    className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3.5 text-sm font-bold text-white transition-all duration-200 hover:bg-red-700"
                >
                    <PhoneOff className="h-4 w-4" />
                    <span>End Stream</span>
                </button>
            </div>
        </div>
    );
}
