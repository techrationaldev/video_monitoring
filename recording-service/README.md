# Recording Service

This microservice handles the recording of Mediasoup streams using FFmpeg. It receives RTP streams, records them to local disk or S3, and notifies the Laravel backend upon completion.

## Architecture

1.  **Mediasoup -> Recording Service**: The service requests a PlainTransport (RTP) from the Mediasoup Server.
2.  **FFmpeg Recording**: The service spawns an FFmpeg process that listens to the RTP stream and saves it as MP4/WebM.
3.  **Storage**: Upon completion, the file is uploaded to S3 (or moved to a local storage directory).
4.  **Laravel Notification**: A webhook is sent to the Laravel backend with recording details (path, duration, size).

## Prerequisites

- Node.js 18+
- FFmpeg installed on the system (`apt install ffmpeg` or `brew install ffmpeg`)

## Setup

1.  Navigate to `recording-service`:
    ```bash
    cd recording-service
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure environment variables:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` with your AWS credentials, Mediasoup URL, and Laravel Webhook URL.

4.  Build and Run:
    ```bash
    npm run build
    npm start
    ```
    Or for development:
    ```bash
    npm run dev
    ```

## API Reference

All requests must include the `Authorization` header: `Bearer <INTERNAL_API_SECRET>`.

### Start Recording
`POST /recording/start`

**Body:**
```json
{
  "roomId": "room-123"
}
```

### Stop Recording
`POST /recording/stop`

**Body:**
```json
{
  "roomId": "room-123"
}
```

### Get Status
`GET /recording/status/:roomId`

## Integration Guide

### 1. Mediasoup Server Integration

The Mediasoup Server must expose endpoints to create and close recording transports.
- `POST /create-recording-transport`: Returns `{ rtpPort, remoteIp, sdp }`.
- `POST /close-recording-transport`: Cleans up the router transport.

### 2. Laravel Backend Integration

The Laravel backend should have a route to handle the webhook:
`POST /api/recording/webhook`

**Payload:**
```json
{
  "event": "recording.complete",
  "roomId": "room-123",
  "filePath": "s3://bucket/room-123_timestamp.mp4",
  "duration": 120, // seconds
  "size": 1048576, // bytes
  "timestamp": "2023-10-27T10:00:00Z"
}
```

### 3. Frontend (Inertia.js) Display

To display recordings:
1.  Store the `filePath` in your database when the webhook is received.
2.  If using S3, generate a pre-signed URL for the video file.
3.  Pass the URL to your Inertia/React component.

```jsx
// React Component
export default function RecordingPlayer({ url }) {
  return (
    <video controls width="100%">
      <source src={url} type="video/mp4" />
      Your browser does not support the video tag.
    </video>
  );
}
```

## Troubleshooting

- **FFmpeg Error**: Check `LOG_LEVEL=debug` output. Ensure the `protocol_whitelist` includes `rtp,udp,file`.
- **No Audio/Video**: Verify the SDP received from Mediasoup matches the actual RTP stream codecs.
- **Webhook Failures**: Ensure the Laravel app is reachable from the recording service container/host.

## Code Review & Improvements

### Self-Correction & Best Practices
- **Queueing**: Currently, start/stop are synchronous. For high scale, use a job queue (BullMQ) to manage recording jobs.
- **Error Handling**: Enhanced error handling in `ffmpegRecorder` to restart on transient failures.
- **Security**: Validate `roomId` format to prevent path traversal (though minimal risk as we use it in filenames).
- **Scalability**: This service is stateful (FFmpeg process). To scale, deploy multiple instances and use a sticky session or a central orchestrator (Redis) to map roomIds to recorder instances.

## Testing

Run unit tests with:
```bash
npm test
```
