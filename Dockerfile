# syntax=docker/dockerfile:1

# ---- deps stage ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- builder stage ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build requires env vars to be present but non-empty
# (actual values come at runtime from Docker env)
ENV AZURE_KEY_VAULT_URI=placeholder
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output — minimal footprint
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

CMD ["node", "server.js"]
