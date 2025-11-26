#!/bin/bash

# Tenelux Deployment Script
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting Tenelux deployment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Are you in the project directory?${NC}"
    exit 1
fi

# Pull latest changes
echo -e "${YELLOW}📥 Pulling latest changes from GitHub...${NC}"
git pull origin main

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

# Build project
echo -e "${YELLOW}🔨 Building project...${NC}"
npm run build

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}❌ PM2 is not installed. Installing...${NC}"
    sudo npm install -g pm2
fi

# Restart PM2
echo -e "${YELLOW}🔄 Restarting PM2...${NC}"
if pm2 list | grep -q "tenelux"; then
    pm2 restart tenelux
else
    pm2 start server.js --name tenelux
    pm2 save
fi

# Show status
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
pm2 status
echo ""
echo -e "${GREEN}📊 Showing logs (Ctrl+C to exit):${NC}"
pm2 logs tenelux --lines 20
