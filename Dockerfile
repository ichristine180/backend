FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN mkdir -p uploads/documents

COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["entrypoint.sh"]
