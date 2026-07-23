# BLVD Park frontend — SSR runtime (Astro output:'server' + @astrojs/node standalone)
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

ARG PUBLIC_API_URL=https://blvdpark.com
ENV PUBLIC_API_URL=$PUBLIC_API_URL

RUN npm run build


FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
