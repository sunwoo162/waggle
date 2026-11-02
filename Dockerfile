# Waggle admin + API server for a self-hosted Linux machine. See docs/development/deployment.md.
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Fallback toolchain in case better-sqlite3 has no prebuilt binary for this platform (e.g. arm64).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    WAGGLE_AUTH_DATABASE_PATH=/data/auth.sqlite \
    WAGGLE_SETTINGS_DATABASE_PATH=/data/school.sqlite \
    WAGGLE_MEMBERS_DATABASE_PATH=/data/members.sqlite
WORKDIR /app
# Keeps dev dependencies: the operator migration commands run through tsx inside this image.
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["npx", "--no-install", "next", "start", "apps/admin", "--hostname", "0.0.0.0", "--port", "3000"]
