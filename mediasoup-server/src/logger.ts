export function logger(msg: string) {
  console.log(`[mediasoup-server] ${new Date().toISOString()} - ${msg}`);
}
