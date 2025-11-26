import StreamSetup from '@/components/StreamSetup';
import { ClientWebRTC } from '@/lib/webrtc/client';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';

export default function ClientStreamPage() {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const [connected, setConnected] = useState(false);
    const [viewerCount, setViewerCount] = useState(0);
    const [isSetup, setIsSetup] = useState(false);
    const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
    const [clientRef, setClientRef] = useState<ClientWebRTC | null>(null);

    // Controls State
    const [audioEnabled, setAudioEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);

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
                            await client.produceStream(stream);
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
                    });
                });
            })
            .catch((err) =>
                console.error('[PAGE] Failed to join room API:', err),
            );
    };

    useEffect(() => {
        if (localVideoRef.current && mediaStream) {
            localVideoRef.current.srcObject = mediaStream;
        }
    }, [mediaStream, connected]);

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

    if (!isSetup) {
        return <StreamSetup onReady={handleStreamReady} />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 dark:bg-gray-900">
            <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800">
                <div className="border-b border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                            Client Streaming
                        </h1>
                        <div className="flex items-center gap-2">
                            {connected ? (
                                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
                                    <span className="mr-1.5 h-2 w-2 rounded-full bg-red-600"></span>
                                    LIVE
                                </span>
                            ) : (
                                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                    CONNECTING
                                </span>
                            )}
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {viewerCount} Viewers
                            </span>
                        </div>
                    </div>
                </div>
                <div className="group relative aspect-video bg-black">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`h-full w-full object-cover ${!videoEnabled ? 'opacity-50' : ''}`}
                    />
                    {!videoEnabled && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                            Camera Paused
                        </div>
                    )}

                    {/* Live Controls Overlay */}
                    <div className="absolute right-0 bottom-0 left-0 flex justify-center gap-4 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                            onClick={toggleAudio}
                            className={`rounded-full p-3 ${audioEnabled ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-red-500 text-white hover:bg-red-600'} backdrop-blur-sm transition-colors`}
                            title={audioEnabled ? 'Mute Mic' : 'Unmute Mic'}
                        >
                            {audioEnabled ? (
                                <svg
                                    className="h-6 w-6"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="h-6 w-6"
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
                        </button>
                        <button
                            onClick={toggleVideo}
                            className={`rounded-full p-3 ${videoEnabled ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-red-500 text-white hover:bg-red-600'} backdrop-blur-sm transition-colors`}
                            title={
                                videoEnabled
                                    ? 'Turn Off Camera'
                                    : 'Turn On Camera'
                            }
                        >
                            {videoEnabled ? (
                                <svg
                                    className="h-6 w-6"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="h-6 w-6"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                    />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                    <p>
                        Share your stream ID:{' '}
                        <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                            {localStorage.getItem('stream_room_id')}
                        </code>
                    </p>
                </div>
            </div>
        </div>
    );
}
