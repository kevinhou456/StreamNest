FROM node:20-alpine

# Install yt-dlp for live stream status detection
RUN apk add --no-cache python3 curl && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install nodemon globally for development hot reload
RUN npm install -g nodemon

# Install dependencies at /app level (outside the mounted server/ volume)
COPY server/package.json ./package.json
RUN npm install

EXPOSE 3000

CMD ["nodemon", "--watch", "server", "server/index.js"]
