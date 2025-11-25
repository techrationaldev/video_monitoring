// import WebSocket, { WebSocketServer } from "ws";
// import { v4 as uuid } from "uuid";
export {};
// const clients = new Map();
// export function startWebsocketServer(port: number) {
//   const wss = new WebSocketServer({ port });
//   wss.on("connection", (ws) => {
//     const id = uuid();
//     clients.set(id, ws);
//     ws.on("message", async (msg) => {
//       const data = JSON.parse(msg.toString());
//       await handleMessage(id, data, ws);
//     });
//     ws.on("close", () => {
//       clients.delete(id);
//       console.log(`Client disconnected: ${id}`);
//     });
//   });
//   console.log(`🚀 WebSocket running on ws://0.0.0.0:${port}`);
// }
// async function handleMessage(id: string, data: any, ws: WebSocket) {
//   const router = getRouter();
//   switch (data.action) {
//     case "getRouterRtpCapabilities":
//       ws.send(
//         JSON.stringify({
//           action: "routerRtpCapabilities",
//           data: router.rtpCapabilities,
//         })
//       );
//       break;
//   }
// }
