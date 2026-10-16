FROM node:22-bookworm-slim
WORKDIR /app

# Railway injects PORT at runtime; default to 3000 locally
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=3000

COPY package*.json ./
# Install deps + Chromium with all system dependencies
RUN npm ci --omit=dev && \
    npx playwright install --with-deps chromium && \
    chmod -R a+rX /ms-playwright

COPY . .

# Ensure data directory exists and is writable
RUN mkdir -p /app/data/screenshots && chown -R node:node /app/data

USER node

# Railway reads the EXPOSE value but routes via $PORT
EXPOSE 3000

CMD ["node", "server.js"]
