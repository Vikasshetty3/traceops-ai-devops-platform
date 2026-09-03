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
RUN apk add --no-cache git curl ca-certificates

WORKDIR /app/backend

# Copy backend package manifests
COPY backend/package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy compiled JavaScript output
COPY --from=builder /app/backend/dist ./dist

EXPOSE 5000

CMD ["node", "dist/backend/src/server.js"]