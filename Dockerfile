# Stage 1: Build the React frontend
FROM node:18-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN VITE_SOCKET_URL=https://supportsense-ai-production.up.railway.app npm run build

# Stage 2: Production server
FROM node:18-alpine AS production
WORKDIR /app

# Copy server
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server/ ./server/
RUN cd server && (npm install better-sqlite3 --build-from-source || echo "SQLite native build failed, JSON fallback will be used")

# Copy built client
COPY --from=client-build /app/client/dist ./client/dist

# Copy root files
COPY .env.example ./.env.example

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.js"]
