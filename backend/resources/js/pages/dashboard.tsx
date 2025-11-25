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
    id: number;
    name: string;
    active: boolean;
}

export default function Dashboard({ rooms = [] }: { rooms: Room[] }) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <h2 className="text-xl font-bold">Active Streams</h2>
                {rooms.length === 0 ? (
                    <div className="text-gray-500">No active rooms found.</div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {rooms.map((room) => (
                            <div
                                key={room.id}
                                className="rounded-lg border bg-white p-4 shadow-sm dark:bg-sidebar"
                            >
                                <h3 className="mb-2 font-semibold">
                                    {room.name}
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
