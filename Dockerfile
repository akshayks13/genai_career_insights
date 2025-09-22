# syntax=docker/dockerfile:1

FROM node:20-slim

# Set env early
ENV NODE_ENV=production \
    PORT=3000

WORKDIR /usr/src/app

# Install only production dependencies
COPY package*.json ./
# Use npm install instead of npm ci since the repo's lockfile is out of sync
RUN npm install --omit=dev --no-audit --no-fund

# Copy application source
COPY server.js ./
COPY src ./src


# Run as non-root for security
USER node

# Expose HTTP port
EXPOSE 3000

# Optional healthcheck hitting /health without extra binaries
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get(`http://localhost:${process.env.PORT||3000}/health`,res=>{if(res.statusCode!==200)process.exit(1)}).on('error',()=>process.exit(1))"

  
CMD ["node", "server.js"]
