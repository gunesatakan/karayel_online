FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY apps/server apps/server
COPY packages/shared packages/shared
RUN npm run build:server

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev

COPY --from=builder /app/apps/server/dist apps/server/dist
EXPOSE 2567
CMD ["npm", "run", "start", "--workspace", "@karayel/server"]
