# ── Ruki Next.js frontend (multi-stage) ───────────────────────────────────────

# Stage 1 — Builder: install deps and produce the production build.
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# Copy source (see .dockerignore for excluded node_modules/.next/caches).
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, so set the API URL here.
# Overridable from docker-compose via build args.
ARG NEXT_PUBLIC_API_URL=http://35.200.247.15:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Clerk publishable key (optional — empty keeps the app in guest-only mode).
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}

RUN npm run build

# Stage 2 — Runner: copy only the production-ready assets.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["npm", "start"]
