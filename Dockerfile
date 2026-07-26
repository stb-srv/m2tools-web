# ---- Build stage ---------------------------------------------------------
# Compiles better-sqlite3's native addon and builds the Vue frontend into
# public/dist/. Kept separate from the runtime stage so the compiler
# toolchain (python3/make/g++, ~200MB) never ships in the final image.
FROM node:26-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g node-gyp

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# better-sqlite3's bundled prebuilt binary (prebuilds/linux-x64.node) has
# been observed to segfault (SIGSEGV) immediately on `new Database(...)` on
# some hosts, even for a plain in-memory DB - a binary-level ABI/glibc
# mismatch rather than anything this app's code can catch or work around.
# better-sqlite3 always prefers that prebuild over a locally-built one
# (see lib/binding.js) if the file is present, so it has to be removed
# after rebuilding from source against this exact image's Node/glibc,
# otherwise the broken prebuild would still win at require-time.
RUN cd node_modules/better-sqlite3 \
    && node-gyp rebuild --release \
    && rm -f prebuilds/*.node

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend

COPY public ./public
COPY frontend ./frontend
RUN npm run build --prefix frontend

# ---- Runtime stage --------------------------------------------------------
FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY package.json server.js ./
COPY server ./server

# data/ (SQLite DB + uploads) and public/basic/ (quest files, cube.txt, etc.)
# are runtime-generated/mutable state - see docker-compose.yml for the
# matching volume mounts. CREDENTIALS_ENCRYPTION_KEY and JWT_SECRET must be
# supplied via environment/.env, not baked into the image.
VOLUME ["/app/data", "/app/public/basic"]
EXPOSE 3001

CMD ["node", "server.js"]
