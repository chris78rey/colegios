FROM node:20-bullseye-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice libreoffice-java-common default-jre ghostscript pandoc \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --production \
    && npx playwright install --with-deps chromium
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
RUN npx prisma generate
EXPOSE 8080
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/seed.js && node src/index.js"]
