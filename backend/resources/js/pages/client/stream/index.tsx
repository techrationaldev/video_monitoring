import { ClientWebRTC } from '@/lib/webrtc/client';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';

export default function ClientStreamPage() {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const [connected, setConnected] = useState(false);
    const [viewerCount, setViewerCount] = useState(0);

    useEffect(() => {
        let roomId = localStorage.getItem('stream_room_id');
        if (!roomId) {
            roomId = `client-${Date.now()}`;
            localStorage.setItem('stream_room_id', roomId);
        }
        const connectionId = crypto.randomUUID();

        // 1. Call Laravel API to create session
        axios
            .post(`/api/rooms/${roomId}/join`, {
                connection_id: connectionId,
            })
            .then(() => {
                console.log('[PAGE] Session created in DB');

                // 2. Connect to Mediasoup
                const client = new ClientWebRTC(
                    'ws://localhost:5005',
                    roomId,
                    connectionId,
                );

                client.init().then(() => {
                    client.onMessage(async (msg) => {
                        console.log('[PAGE] Received:', msg);

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
                            if (localVideoRef.current) {
                                await client.startVideoStream(
                                    localVideoRef.current,
                                );
                                setConnected(true);
                            }
                        }

                        if (msg.action === 'viewer-count') {
                            setViewerCount(msg.count);
                        }
                    });
                });
            })
            .catch((err) => {
                console.error('[PAGE] Failed to join room API:', err);
            });
    }, []);

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
                                <svg
                                    className="mr-1.5 h-3 w-3"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                    <path
                                        fillRule="evenodd"
                                        d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                        clipRule="evenodd"
                                    />
                                </svg>
                                {viewerCount} Viewers
                            </span>
                        </div>
                    </div>
                </div>
                <div className="relative aspect-video bg-black">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                    />
                    {!connected && (
                        <div className="absolute inset-0 flex items-center justify-center text-white">
                            <div className="flex flex-col items-center gap-2">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
                                <p>Connecting to server...</p>
                            </div>
                        </div>
                    )}
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
