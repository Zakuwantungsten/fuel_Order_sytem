# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache optimized)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Static assets directory (created empty; populate via volume or CI if needed)
RUN mkdir -p ./assets

# Own everything by non-root user
RUN chown -R appuser:appgroup /app

USER appuser

# Railway, Render, Fly, etc. inject PORT at runtime — default to 5000
EXPOSE 5000

# Health check (matches /api/health endpoint)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-5000}/api/health || exit 1

CMD ["node", "dist/entrypoint.js"]
