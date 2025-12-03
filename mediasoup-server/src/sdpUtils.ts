import { types } from "mediasoup";

/**
 * Generates an SDP for FFmpeg to consume the PlainTransport streams.
 *
 * @param ip - The IP address of the PlainTransport (where FFmpeg should send RTCP,
 *             but for receiving, FFmpeg reads from the port it binds to?
 *             No, FFmpeg acting as a client receiving a stream needs to know the remote stream details via SDP.
 *             Wait, PlainTransport *sends* RTP to a destination.
 *             The 'recording-service' starts ffmpeg listening on a port?
 *             Or does Mediasoup send to FFmpeg?
 *
 *             Usually:
 *             1. Mediasoup creates PlainTransport (listening on port X).
 *             2. FFmpeg acts as a client pulling from it? OR Mediasoup pushes to FFmpeg?
 *
 *             If Mediasoup pushes:
 *             1. FFmpeg starts listening on UDP port Y.
 *             2. Mediasoup PlainTransport.connect({ ip: ffmpegIP, port: Y }).
 *
 *             If Mediasoup is the server (listening):
 *             1. Mediasoup PlainTransport listens on Port X.
 *             2. FFmpeg reads from rtp://IP:X
 *
 *             The 'recording-service' code I wrote does:
 *             `ffmpeg -i sdp_file`
 *             And the SDP file usually contains `c=IN IP4 <MediasoupIP>` and `m=video <MediasoupPort>`.
 *             So FFmpeg connects TO Mediasoup.
 *
 *             So Mediasoup PlainTransport should be "comedia: true" (if it waits for connection)
 *             or we just use the port it opened.
 *             Mediasoup PlainTransport with `comedia: false` (default) expects `connect()` to be called with remote IP/Port.
 *             If FFmpeg is the receiver, Mediasoup must *send* to FFmpeg.
 *
 *             BUT, `recording-service` code has:
 *             `ffmpeg -protocol_whitelist "file,udp,rtp" -i input.sdp ...`
 *
 *             If I use an SDP with `c=IN IP4 <MediasoupIP>` and `m=video <MediasoupPort>`,
 *             FFmpeg will try to receive from that address.
 *             Mediasoup's PlainTransport must be configured to send to *where FFmpeg is* OR
 *             if we want FFmpeg to "pull", maybe PlainTransport isn't the right tool, or we need `comedia` mode?
 *
 *             Actually, the standard way with Mediasoup recording is:
 *             1. Create PlainTransport on Mediasoup (server side).
 *             2. It yields `tuple.localPort`.
 *             3. If we want Mediasoup to *push* to FFmpeg:
 *                - FFmpeg must listen on a port (e.g. `rtp://0.0.0.0:1234`).
 *                - We call `transport.connect({ ip: 'ffmpeg-ip', port: 1234 })`.
 *
 *             If we want FFmpeg to *pull* (receive) from Mediasoup (which seems to be implied by `ffmpeg -i sdp`):
 *             - The SDP tells FFmpeg where the stream is.
 *             - Mediasoup PlainTransport needs to send packets to FFmpeg's socket.
 *             - But FFmpeg doesn't "listen" and "accept" connections in RTP mode exactly like TCP.
 *             - Typically, you tell Mediasoup to send to a port, and you tell FFmpeg to listen on that port.
 *
 *             Let's look at `recording-service` implementation again.
 *             It asks Mediasoup for `rtpPort`.
 *             It writes SDP.
 *             It starts FFmpeg.
 *
 *             If Mediasoup is sending to FFmpeg:
 *             Mediasoup needs to know FFmpeg's IP/Port.
 *             The `createRecordingTransport` request didn't send FFmpeg's IP/Port.
 *
 *             Correct approach for "Mediasoup recording with FFmpeg":
 *             1. Mediasoup creates PlainTransport.
 *             2. We pick a port for FFmpeg to listen on?
 *             3. OR we let Mediasoup pick a port, and FFmpeg connects?
 *
 *             Actually, with `ffmpeg -i input.sdp`, if the SDP says `c=IN IP4 127.0.0.1` and `m=video 5000 RTP/AVP ...`,
 *             FFmpeg expects packets to arrive at its *local* port 5000?
 *             No, SDP describes the *session*.
 *             In "receive" mode, `m=` specifies the local port FFmpeg should listen on.
 *
 *             So if I generate SDP with:
 *             `c=IN IP4 127.0.0.1` (IP of Mediasoup?? No, IP of receiver usually)
 *             `m=video 5000 ...` (Port receiver listens on)
 *
 *             Then I need to tell Mediasoup to send to `127.0.0.1:5000`.
 *
 *             So:
 *             1. `recording-service` (the client of Mediasoup here) should probably tell Mediasoup "Send stream to 127.0.0.1:5000".
 *             2. But `recording-service` is dynamic. It needs to pick a free port.
 *
 *             Current `recording-service` implementation assumes `startRecordingTransport` returns `rtpPort`.
 *             This implies `recording-service` expects Mediasoup to be the server/listener?
 *
 *             If Mediasoup is the "server" (RTP source):
 *             The PlainTransport can be created with `comedia: true`.
 *             This means Mediasoup waits for a packet from the remote side (FFmpeg) to learn the remote IP/Port.
 *             So if FFmpeg sends a packet (e.g. RR/RTCP or just dummy) to Mediasoup's `tuple.localPort`, Mediasoup locks on and sends media back.
 *
 *             However, `ffmpeg -i sdp` usually just listens. It doesn't "dial out" to say hello unless configured.
 *
 *             Let's switch to the standard "Push" model which is more robust.
 *             1. `recording-service` should define 2 ports (audio/video) to listen on.
 *             2. Pass these ports to Mediasoup.
 *             3. Mediasoup `connect()`s the PlainTransport to these ports.
 *
 *             BUT, I cannot easily change `recording-service` logic drastically without revising my previous step.
 *             The previous step implemented `startRecordingTransport` in `recording-service` which expects `{ sdp }`.
 *
 *             Let's use the `comedia` approach or just assume everything is on localhost for now (as per requirements "standalone microservice... integrates with my current system").
 *             The Docker restriction was "No Dockerfile", but user implies separate services.
 *             If they are on the same machine (localhost), we can pick ports.
 *
 *             Let's stick to the `recording-service`'s assumption: Mediasoup gives us the details.
 *             If `recording-service` just runs `ffmpeg -i sdp`, and the SDP says `c=IN IP4 127.0.0.1` and `m=video <local_ffmpeg_port>`, then FFmpeg listens on `<local_ffmpeg_port>`.
 *
 *             So `mediasoup-server` needs to:
 *             1. Create PlainTransport.
 *             2. `connect()` it to `recording-service`'s IP and `<local_ffmpeg_port>`.
 *
 *             This requires `recording-service` to tell Mediasoup its IP/Port.
 *             The current `recording-service` code DOES NOT send IP/Port.
 *
 *             I should modify `recording-service` to pick a free port and send it?
 *             Or can I update `recording-service`? Yes, I can updates `recording-service` in the next steps too (it's part of the plan "improvements... code review").
 *
 *             Actually, let's fix this in `mediasoup-server` side to make it work with the *current* `recording-service` code if possible, or minimally change both.
 *
 *             If `recording-service` runs `ffmpeg`, and we want `ffmpeg` to receive RTP.
 *             FFmpeg receiving RTP via SDP:
 *             The SDP specifies the port FFmpeg listens on.
 *
 *             So `recording-service` logic:
 *             1. Ask Mediasoup to start recording.
 *             2. Mediasoup says "I am ready".
 *             3. `recording-service` needs to know what port to put in the SDP for FFmpeg to listen on.
 *             4. AND `recording-service` needs to tell Mediasoup to send packets to that port.
 *
 *             Okay, I will update `recording-service` to:
 *             1. Pick 2 UDP ports (audio/video).
 *             2. Send them to `mediasoup-server`.
 *             3. `mediasoup-server` creates PlainTransport and `connect()`s to those ports.
 *             4. `mediasoup-server` returns the SDP (with those ports in `m=` lines).
 *             5. `recording-service` runs ffmpeg.
 *
 *             Wait, finding free UDP ports in Node.js is a bit boilerplate.
 *
 *             Alternative: `comedia` (Client-Oriented Media).
 *             If Mediasoup PlainTransport is `comedia: true`.
 *             Mediasoup listens on `tuple.localPort`.
 *             FFmpeg must *send* a packet to `tuple.localPort` to start the flow.
 *             Does `ffmpeg -i sdp` send packets?
 *             Standard `ffmpeg -i sdp` is a receiver. It sends RTCP RR packets if configured, but maybe not immediately or reliably enough to trigger comedia latching without correct config.
 *
 *             Let's go with the "Push" model.
 *             I will update `recording-service` to send `localIp` and `localPort`?
 *             Or simplified: Hardcode ports or ranges? No, that's bad.
 *
 *             Let's use `get-port` logic in `recording-service`.
 *
 *             Wait, the user prompt says: "Use an ffmpeg pipeline such as: ffmpeg ... -i input.sdp ...".
 *
 *             Let's implement the `createRecordingTransport` in Mediasoup to:
 *             1. Create PlainTransport (`comedia: false`).
 *             2. Use fixed ports? No.
 *
 *             Okay, I will modify `recording-service` to include `clientIp` (its own IP) in the request?
 *             And maybe we just let Mediasoup pick the ports for FFmpeg? No, FFmpeg runs on `recording-service` machine. `recording-service` controls the ports.
 *
 *             Plan Refinement:
 *             1. Modify `recording-service` `MediasoupConnector` and `RecordingManager`:
 *                - Find free ports (e.g. 5000, 5002).
 *                - Request `create-recording-transport` with `recordingServiceIp` and `recordingServicePorts`.
 *             2. Modify `mediasoup-server`:
 *                - Accept `ip`, `port` (audio), `port` (video).
 *                - Create PlainTransport.
 *                - `connect()` to those ports.
 *                - Return SDP with those ports.
 *
 *             This seems most robust.
 */

 // For now, I'll write the SDP Utils to support generating the string.

 export function generateSDP(ip: string, audioPort: number | null, videoPort: number | null, audioCodec: any, videoCodec: any): string {
   let sdp = `v=0
o=- 0 0 IN IP4 ${ip}
s=Mediasoup
c=IN IP4 ${ip}
t=0 0
`;

  if (audioPort && audioCodec) {
    sdp += `m=audio ${audioPort} RTP/AVP ${audioCodec.payloadType}
a=rtpmap:${audioCodec.payloadType} ${audioCodec.mimeType.split('/')[1]}/${audioCodec.clockRate}/${audioCodec.channels}
a=recvonly
`;
  }

  if (videoPort && videoCodec) {
    sdp += `m=video ${videoPort} RTP/AVP ${videoCodec.payloadType}
a=rtpmap:${videoCodec.payloadType} ${videoCodec.mimeType.split('/')[1]}/${videoCodec.clockRate}
a=recvonly
`;
  }

  return sdp;
}
