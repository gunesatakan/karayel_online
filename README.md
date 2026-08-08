# Karayel Online

Mobile browser multiplayer game prototype.

## Stack

- `apps/web`: Phaser 3 + Vite + TypeScript
- `apps/server`: Node.js + Colyseus + TypeScript
- `packages/shared`: shared character and player types

## Local Development

Install dependencies:

```sh
npm install
```

Run the game server:

```sh
npm run dev:server
```

Run the web client in another terminal:

```sh
npm run dev:web
```

The web client expects the game server at `ws://localhost:2567` by default.

## Deployment

- Vercel should use the root project with `vercel.json`.
- Fly.io deploys the game server from `apps/server/fly.toml`.
- Add `FLY_API_TOKEN` as a GitHub Actions secret before enabling automatic Fly deploys.
- For production, set `VITE_GAME_SERVER_URL` to the Fly WebSocket URL, for example `wss://karayel-online-server.fly.dev`.
