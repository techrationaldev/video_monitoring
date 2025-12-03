/**
 * Logs a message to the console with a timestamp and a prefix.
 *
 * @param {string} msg - The message to log.
 * @returns {void}
 */
export function logger(msg: string) {
  console.log(`[mediasoup-server] ${new Date().toISOString()} - ${msg}`);
}
