import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "colyseus";
import { MatchRoom } from "./rooms/MatchRoom.js";

const port = Number(process.env.PORT ?? 2567);
const app = express();

app.use(cors());
app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "karayel-server",
    version: "tower-defense-core",
    features: ["tower-defense-path", "tower-placement", "tower-upgrades", "latency-ping"]
  });
});

app.get("/rooms", (_request, response) => {
  response.json({
    rooms: MatchRoom.listPublicRooms()
  });
});

const httpServer = createServer(app);
const gameServer = new Server({
  server: httpServer
});

gameServer.define("match", MatchRoom);

httpServer.listen(port, () => {
  console.log(`Karayel game server listening on :${port}`);
});
