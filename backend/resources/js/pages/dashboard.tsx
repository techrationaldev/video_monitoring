import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { Activity, MonitorPlay, Server, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RoomMonitor } from './admin/room-monitor';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: dashboard().url,
    },
];

interface Room {
    id: string;
    name: string;
    viewerCount?: number;
}

export default function Dashboard({
    rooms: initialRooms = [],
}: {
    rooms: Room[];
}) {
    const [rooms, setRooms] = useState<Room[]>(initialRooms);
    const [isConnected, setIsConnected] = useState(false);
    const [totalViewers, setTotalViewers] = useState(0);

    useEffect(() => {
        const wsUrl =
            import.meta.env.VITE_MEDIASOUP_WS_URL || 'ws://localhost:5005';
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Connected to Mediasoup for Dashboard updates');
            setIsConnected(true);
            // Join as admin to receive updates
            const payload = {
                action: 'join-as-admin',
                roomId: 'admin-dashboard', // Dummy room ID
            };
            ws.send(JSON.stringify(payload));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.action === 'active-rooms') {
                    setRooms(msg.data);
                    // Calculate total viewers
                    const total = msg.data.reduce(
                        (acc: number, room: Room) =>
                            acc + (room.viewerCount || 0),
                        0,
                    );
                    setTotalViewers(total);
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
            <div className="flex min-h-full flex-col gap-6 bg-zinc-950 p-6 text-zinc-100">
                {/* Header & Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-sm backdrop-blur-xl">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                                <MonitorPlay className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-400">
                                    Active Streams
                                </p>
                                <h3 className="text-2xl font-bold text-white">
                                    {rooms.length}
                                </h3>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-sm backdrop-blur-xl">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                                <Users className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-400">
                                    Total Viewers
                                </p>
                                <h3 className="text-2xl font-bold text-white">
                                    {totalViewers}
                                </h3>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-sm backdrop-blur-xl">
                        <div className="flex items-center gap-4">
                            <div
                                className={`flex h-12 w-12 items-center justify-center rounded-lg ${isConnected ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                            >
                                <Server className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-400">
                                    System Status
                                </p>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-2xl font-bold text-white">
                                        {isConnected ? 'Online' : 'Offline'}
                                    </h3>
                                    {isConnected && (
                                        <span className="relative flex h-2.5 w-2.5">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"></span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Active Streams Grid */}
                <div>
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                            <Activity className="h-5 w-5 text-blue-500" />
                            Live Feeds
                        </h2>
                        <span className="text-sm text-zinc-500">
                            Auto-refreshing
                        </span>
                    </div>

                    {rooms.length === 0 ? (
                        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 text-zinc-500">
                            <MonitorPlay className="mb-4 h-12 w-12 opacity-20" />
                            <p>No active streams detected</p>
                            <p className="text-sm">
                                Waiting for clients to connect...
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {rooms.map((room) => (
                                <Link
                                    key={room.id}
                                    href={`/rooms/${room.name}/monitor`}
                                    className="group relative aspect-video overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-all hover:border-zinc-700 hover:shadow-2xl"
                                >
                                    <RoomMonitor
                                        roomId={room.name}
                                        variant="card"
                                    />

                                    {/* Hover Overlay for "Watch Live" - Optional but good for UX */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                        <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur-md">
                                            <MonitorPlay className="h-4 w-4" />
                                            Watch Live
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
