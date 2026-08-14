# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Build-time brand / font / URL args — baked into the Vite bundle
ARG VITE_BRAND_NAME="U-all Solutions"
ARG VITE_BRAND_TAGLINE="Wi-Fi Marketing e captação de dados"
ARG VITE_FONT_SANS="Inter"
ARG VITE_FONT_SERIF="Inter"
ARG VITE_FONT_MONO="JetBrains Mono"
ARG VITE_SOCKET_URL=""
ARG VITE_AGENT_URL=""

ENV VITE_BRAND_NAME=$VITE_BRAND_NAME
ENV VITE_BRAND_TAGLINE=$VITE_BRAND_TAGLINE
ENV VITE_FONT_SANS=$VITE_FONT_SANS
ENV VITE_FONT_SERIF=$VITE_FONT_SERIF
ENV VITE_FONT_MONO=$VITE_FONT_MONO
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_AGENT_URL=$VITE_AGENT_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
