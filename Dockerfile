# Dockerfile

# ---- Builder Stage ----
FROM node:22-alpine AS builder
WORKDIR /app

# Copy ALL package.json files first
COPY package*.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install ALL dependencies for all workspaces
RUN npm install

# Copy the rest of the source code
COPY ./client ./client
COPY ./server ./server

# Build Client
WORKDIR /app/client
RUN npm run build

# Build Server
WORKDIR /app/server
RUN npm run build


# ---- Production Stage ----
FROM node:22-alpine AS production
WORKDIR /app

# --- Install custom ffmpeg ---
RUN apk add --no-cache wget dpkg && \
    wget https://github.com/jellyfin/jellyfin-ffmpeg/releases/download/v7.1.2-1/jellyfin-ffmpeg7_7.1.2-1-bookworm_arm64.deb && \
    dpkg -i jellyfin-ffmpeg7_7.1.2-1-bookworm_arm64.deb && \
    rm jellyfin-ffmpeg7_7.1.2-1-bookworm_arm64.deb
# -----------------------------

ENV NODE_ENV=production

# Copy ALL package.json files first for production install
COPY package*.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# Install ONLY production dependencies for all workspaces
RUN npm install --omit=dev

# Copy the built code from the builder stage
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 8080
CMD ["node", "server/dist/index.js"]