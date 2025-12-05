# DockerMaid - Docker Container Management Dashboard
# Multi-stage build for frontend + backend

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Update Alpine packages for security patches
RUN apk update && apk upgrade --no-cache

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production image with Node.js server
FROM node:20-alpine AS production
WORKDIR /app

# Update Alpine packages for security patches
RUN apk update && apk upgrade --no-cache

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built frontend
COPY --from=frontend-builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
CMD ["node", "server/index.js"]
