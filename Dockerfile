# Stage 1: Build the React frontend
FROM node:18-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:18-alpine AS production
WORKDIR /app

# Copy server
COPY server/package*.json ./server/
RUN cd server && npm ci --production
COPY server/ ./server/
RUN cd server && (npm install better-sqlite3 --build-from-source || echo "SQLite native build failed, JSON fallback will be used")

# Copy built client
COPY --from=client-build /app/client/dist ./client/dist

# Copy root files
COPY .env.example ./.env.example

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server/index.js"]
