FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /app/database /app/uploads

EXPOSE 3001

CMD ["node", "server.js"]

