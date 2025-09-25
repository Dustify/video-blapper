# Dockerfile (Corrected Version)

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

# --- Add this line to install ffmpeg ---
RUN apk add --no-cache ffmpeg
# ------------------------------------

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