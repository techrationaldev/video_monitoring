import axios from 'axios';
import logger from '../utils/logger';

// This service is responsible for communicating with the Mediasoup Server
// to request the RTP capabilities or Transport information needed for recording.

export class MediasoupConnector {
  private mediasoupUrl: string;
  private apiSecret: string;

  constructor() {
    this.mediasoupUrl = process.env.MEDIASOUP_API_URL || 'http://localhost:3000/api/mediasoup';
    this.apiSecret = process.env.INTERNAL_API_SECRET || '';
  }

  // Request the Mediasoup server to create a PlainTransport for recording
  // and return the necessary connection details (IP, Port, SDP, etc.)
  async startRecordingTransport(roomId: string, recordingIp: string, audioPort: number, videoPort: number): Promise<{ transportId: string, sdp: string }> {
    try {
      logger.info(`Requesting recording transport from Mediasoup for room ${roomId}`);

      const response = await axios.post(`${this.mediasoupUrl}/create-recording-transport`, {
        roomId,
        recordingIp,
        audioPort,
        videoPort
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiSecret}`,
          'Content-Type': 'application/json'
        }
      });

      // Assuming the response contains the SDP and connection info needed by FFmpeg
      // response.data = { sdp: "v=0...", rtpPort: 5000, remoteIp: "127.0.0.1" }
      return response.data;

    } catch (error: any) {
      logger.error(`Failed to connect to Mediasoup: ${error.message}`);
      throw new Error('Failed to initialize recording transport with Mediasoup');
    }
  }

  // Notify Mediasoup to close the transport
  async stopRecordingTransport(roomId: string): Promise<void> {
    try {
        logger.info(`Requesting Mediasoup to close recording transport for room ${roomId}`);
        await axios.post(`${this.mediasoupUrl}/close-recording-transport`, {
            roomId
        }, {
            headers: {
                'Authorization': `Bearer ${this.apiSecret}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (error: any) {
        logger.error(`Failed to close Mediasoup transport: ${error.message}`);
        // We log but don't throw, as we want to continue local cleanup
    }
  }
}
