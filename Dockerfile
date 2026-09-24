FROM node:22-alpine AS builder
RUN npm install -g pnpm@9.15.4
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
FROM node:22-alpine AS runner
RUN npm install -g pnpm@9.15.4
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
RUN mkdir -p uploads && chown -R node:node uploads
USER node
EXPOSE 3000
CMD ["node","dist/src/main.js"]
