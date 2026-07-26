FROM node:20-alpine AS builder
RUN npm install -g pnpm@9.15.4 --registry=https://registry.npmmirror.com
RUN pnpm config set registry https://registry.npmmirror.com
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm build
FROM node:20-alpine AS runner
RUN npm install -g pnpm@9.15.4 --registry=https://registry.npmmirror.com
RUN pnpm config set registry https://registry.npmmirror.com
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile=false
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
RUN mkdir -p uploads
EXPOSE 3000
CMD ["node","dist/src/main.js"]
