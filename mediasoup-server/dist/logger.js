export function logger(msg) {
    console.log(`[mediasoup-server] ${new Date().toISOString()} - ${msg}`);
}
