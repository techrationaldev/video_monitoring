# Application Features Checklist

## Core Streaming

- [x] **Low Latency Video**: Sub-second latency using WebRTC/Mediasoup.
- [x] **Real-Time Dashboard**: Live list of active streams (WebSocket based).
- [x] **Multi-View Grid**: Watch multiple streams simultaneously in a grid layout.
- [x] **Audio Level Indicators**: Visual bars showing audio volume for each stream.
- [x] **Audio Level Indicators**: Visual bars showing audio volume for each stream.
- [ ] **Connection Quality**: Detailed stats (bitrate, packet loss, latency) for admins.
- [ ] **Stream Health Monitoring**: Real-time graphs for bitrate and FPS.
- [ ] **Source Information**: Display IP, OS, Browser, and Protocol details.

## Stream Management

- [ ] **Recording**: Record live streams to MP4 (UI controls and list).
- [ ] **Snapshots**: Capture high-res images from the live stream.
- [ ] **Kick/Ban**: Admin ability to force-disconnect a streamer or viewer.
- [x] **Remote Mute**: Admin ability to mute a streamer's audio.

## Collaboration

- [ ] **Screen Sharing**: Allow streamers to switch between camera and screen share.
- [ ] **Text Chat**: Real-time chat for each room.
- [ ] **System Announcements**: Admin broadcast messages to all connected users.

## Security & Access

- [ ] **Token Authentication**: Secure access to streams via signed tokens.
- [x] **Role-Based Access**: Distinct permissions for Admins, Streamers, and Viewers.
- [ ] **IP Whitelisting**: Restrict streaming to specific networks.
