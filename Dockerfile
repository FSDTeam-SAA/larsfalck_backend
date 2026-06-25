# ---- Stage 1: Build ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Verify both entrypoints compiled 
RUN ls dist/src/main.js && ls dist/src/worker.js

# ---- Stage 2: Production ----
FROM node:22-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Create uploads folder so multer doesn't crash
RUN mkdir -p uploads

EXPOSE 5000

CMD ["node", "dist/src/main.js"]