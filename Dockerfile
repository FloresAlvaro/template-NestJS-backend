FROM node:24-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 3001
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && exec node dist/src/main.js"]
