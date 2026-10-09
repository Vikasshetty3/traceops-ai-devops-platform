FROM node:20-alpine AS builder

WORKDIR /app

# Copy backend package manifests for dependency installation
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm ci

# Copy full source trees required for TypeScript compilation
WORKDIR /app
COPY backend ./backend
COPY devops-adapter ./devops-adapter
COPY experiment-engine ./experiment-engine
COPY ml-service/src/model.ts ./ml-service/src/model.ts

# Build backend
WORKDIR /app/backend
RUN npm run build


FROM node:20-alpine AS runner

# Install git, curl, and certificates for repository acquisition
RUN apk add --no-cache git curl ca-certificates docker-cli

WORKDIR /app/backend

# Copy backend package manifests
COPY backend/package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy compiled JavaScript output
COPY --from=builder /app/backend/dist ./dist

# Copy verified model data artifacts
COPY data /app/data
COPY ml-service/data /app/ml-service/data

EXPOSE 5000

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health/ready || exit 1

CMD ["node", "dist/backend/src/server.js"]