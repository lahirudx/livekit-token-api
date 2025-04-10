FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"] 