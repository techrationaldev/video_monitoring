import dgram from 'dgram';

export const getFreeUdpPort = async (): Promise<number> => {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        socket.bind(0, () => {
            const addr = socket.address();
            const port = addr.port;
            socket.close(() => resolve(port));
        });
        socket.on('error', reject);
    });
}
