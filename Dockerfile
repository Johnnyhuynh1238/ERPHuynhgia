# Stage 1: Cài dependencies (tách riêng để tận dụng cache)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build ứng dụng Next.js
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# Stage 3: Runtime image gọn nhẹ
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache ghostscript tesseract-ocr tesseract-ocr-data-eng tesseract-ocr-data-vie

# Chỉ copy những thứ cần thiết để chạy production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/lib/task-template-csv.ts ./lib/task-template-csv.ts

EXPOSE 3000
CMD ["sh", "-c", "npx prisma generate && npm run start"]
