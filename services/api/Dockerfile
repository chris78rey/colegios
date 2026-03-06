FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
EXPOSE 8080
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
