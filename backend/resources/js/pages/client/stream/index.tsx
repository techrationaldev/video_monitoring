import { AudioLevelIndicator } from '@/components/AudioLevelIndicator';
import StreamSetup from '@/components/StreamSetup';
import { ClientWebRTC } from '@/lib/webrtc/client';
import axios from 'axios';
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

    // Admin Talkback State
    const [remoteAudioTrack, setRemoteAudioTrack] =
        useState<MediaStreamTrack | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);

    // Device State
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedVideoDeviceId, setSelectedVideoDeviceId] =
        useState<string>('');
    const [selectedAudioDeviceId, setSelectedAudioDeviceId] =
        useState<string>('');

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
                setVideoDevices(videoInputs);
                setAudioDevices(audioInputs);

                // Set initial selection based on current stream if possible, or defaults
                if (videoInputs.length > 0)
                    setSelectedVideoDeviceId(videoInputs[0].deviceId);
                if (audioInputs.length > 0)
                    setSelectedAudioDeviceId(audioInputs[0].deviceId);
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
            <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 dark:bg-gray-900">
                <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-xl dark:bg-gray-800">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                        <svg
                            className="h-8 w-8 text-red-600 dark:text-red-200"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </div>
                    <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                        Stream Ended
                    </h2>
                    <p className="mb-6 text-gray-500 dark:text-gray-400">
                        The streaming session has been terminated.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-gray-800"
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

                    {/* Remote Audio Player */}
                    <audio ref={remoteAudioRef} autoPlay />
                    {remoteAudioTrack && (
                        <div className="absolute top-4 right-4 flex animate-pulse items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-white shadow-lg">
                            <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                />
                            </svg>
                            <span className="text-xs font-bold">
                                Admin Speaking
                            </span>
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
                        {mediaStream?.getAudioTracks()[0] && (
                            <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 backdrop-blur-sm">
                                <span className="text-xs text-white">
                                    Mic Level:
                                </span>
                                <AudioLevelIndicator
                                    track={mediaStream.getAudioTracks()[0]}
                                />
                            </div>
                        )}
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
                <div className="p-4">
                    <div className="mb-4 flex flex-wrap gap-4">
                        <div className="min-w-[200px] flex-1">
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Camera
                            </label>
                            <select
                                value={selectedVideoDeviceId}
                                onChange={(e) => switchCamera(e.target.value)}
                                className="w-full rounded-lg border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
                        <div className="min-w-[200px] flex-1">
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Microphone
                            </label>
                            <select
                                value={selectedAudioDeviceId}
                                onChange={(e) =>
                                    switchMicrophone(e.target.value)
                                }
                                className="w-full rounded-lg border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
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
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Share your stream ID:{' '}
                            <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                                {localStorage.getItem('stream_room_id')}
                            </code>
                        </p>
                        <button
                            onClick={endStream}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-gray-800"
                        >
                            End Stream
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
