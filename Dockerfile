FROM node:24-slim AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm run build


FROM node:24-slim AS runner

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY openapi ./openapi
COPY .env.example ./.env.example

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
