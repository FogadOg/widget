FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV QUIET_LOCALE=1
# ARG must be declared before use; placing after COPY so npm ci layer stays cached
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_WIDGET_URL
ARG EMBED_ALLOWLIST
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_WIDGET_URL=$NEXT_PUBLIC_WIDGET_URL
ENV EMBED_ALLOWLIST=$EMBED_ALLOWLIST
RUN EMBED_ALLOWLIST="${EMBED_ALLOWLIST:-$NEXT_PUBLIC_WIDGET_URL}" node scripts/build-embed.js && \
	EMBED_ALLOWLIST="${EMBED_ALLOWLIST:-$NEXT_PUBLIC_WIDGET_URL}" npx next build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG EMBED_ALLOWLIST
ENV EMBED_ALLOWLIST=$EMBED_ALLOWLIST
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
