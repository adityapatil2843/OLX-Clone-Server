FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy application source code
COPY src ./src

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 5000

CMD ["node", "src/server.js"]

