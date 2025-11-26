import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: dashboard().url,
    },
];

import { RoomMonitor } from './admin/room-monitor';

interface Room {
    id: string; // Changed to string as it comes from WS
    name: string;
    viewerCount?: number;
}

import { useEffect, useState } from 'react';
// import { router } from '@inertiajs/react'; // Polling removed

export default function Dashboard({
    rooms: initialRooms = [],
}: {
    rooms: Room[];
}) {
    const [rooms, setRooms] = useState<Room[]>(initialRooms);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const wsUrl =
            import.meta.env.VITE_MEDIASOUP_WS_URL || 'ws://localhost:5005';
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to Mediasoup for Dashboard updates');
            setIsConnected(true);
            // Join as admin to receive updates
            ws.send(
                JSON.stringify({
                    action: 'join-as-admin',
                    roomId: 'admin-dashboard', // Dummy room ID
                }),
            );
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.action === 'active-rooms') {
                    setRooms(msg.data);
                }
            } catch (error) {
                console.error('Error parsing WS message:', error);
            }
        };

        ws.onclose = () => {
            console.log('Disconnected from Mediasoup');
            setIsConnected(false);
        };

        return () => {
            ws.close();
        };
    }, []);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">Active Streams</h2>
                    <div
                        className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-500' : 'text-red-500'}`}
                    >
                        <span
                            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
                        ></span>
                        {isConnected
                            ? 'Real-time Updates Active'
                            : 'Connecting...'}
                    </div>
                </div>
                {rooms.length === 0 ? (
                    <div className="text-gray-500">No active rooms found.</div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {rooms.map((room) => (
                            <div
                                key={room.id}
                                className="rounded-lg border bg-white p-4 shadow-sm dark:bg-sidebar"
                            >
                                <h3 className="mb-2 flex items-center justify-between font-semibold">
                                    <span>{room.name}</span>
                                    {room.viewerCount !== undefined && (
                                        <span className="text-xs text-gray-500">
                                            {room.viewerCount} viewers
                                        </span>
                                    )}
                                </h3>
                                <div className="aspect-video overflow-hidden rounded bg-black">
                                    <RoomMonitor
                                        roomId={room.name}
                                        variant="card"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
