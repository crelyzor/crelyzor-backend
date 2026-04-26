# ── Stage 1: deps — install only (used by dev compose) ───────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
RUN pnpm db:generate


# ── Stage 2: builder — compile TypeScript (used by prod/staging compose) ─────
FROM deps AS builder
COPY . .
RUN pnpm build


# ── Stage 3: runner — minimal production image ────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/prisma ./prisma
RUN pnpm install --prod --frozen-lockfile && pnpm db:generate
EXPOSE 4000
CMD ["node", "dist/index.js"]
