import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import clients from '@/routes/clients';
import { BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';

interface Client {
    id: number;
    name: string;
    email: string;
}

interface PaginationLink {
    url: string | null;
    label: string;
    active: boolean;
}

interface Props {
    clients: {
        data: Client[];
        links: PaginationLink[];
    };
}

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Clients',
        href: clients.index.url(),
    },
];

export default function Index({ clients: clientData }: Props) {
    const handleDelete = (id: number) => {
        if (!confirm('Are you sure you want to delete this client?')) return;
        router.delete(`/clients/${id}`);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Clients" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <Card className="mt-8">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Clients</CardTitle>

                        <Link href={clients.create.url()}>
                            <Button>Add Client</Button>
                        </Link>
                    </CardHeader>

                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {clientData.data.map((client) => (
                                    <TableRow key={client.id}>
                                        <TableCell>{client.name}</TableCell>
                                        <TableCell>{client.email}</TableCell>

                                        <TableCell className="flex gap-2">
                                            <Link
                                                href={`/clients/${client.id}/edit`}
                                            >
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                >
                                                    Edit
                                                </Button>
                                            </Link>

                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() =>
                                                    handleDelete(client.id)
                                                }
                                            >
                                                Delete
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}

                                {clientData.data.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={3}
                                            className="py-6 text-center text-muted-foreground"
                                        >
                                            No clients found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>

                        {/* Pagination */}
                        <div className="mt-4 flex justify-end gap-2">
                            {clientData.links.map((link, index) => (
                                <Button
                                    key={index}
                                    variant={
                                        link.active ? 'default' : 'outline'
                                    }
                                    disabled={!link.url}
                                    onClick={() =>
                                        link.url && router.visit(link.url)
                                    }
                                    dangerouslySetInnerHTML={{
                                        __html: link.label,
                                    }}
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
