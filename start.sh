#!/bin/bash
# Velo One-Command Startup
# Usage: ./start.sh or curl ... | bash

set -e

VELO_HOME="${VELO_HOME:-$HOME/.velo}"
CONFIG_FILE="$VELO_HOME/velo.toml"
ENV_FILE="$VELO_HOME/velo.env"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}  ▓▓▓  Velo Quick Start  ▓▓▓${NC}"
echo ""

# Check if already running
if pgrep -f "velo.*telegram" > /dev/null; then
    echo -e "${GREEN}✓ Velo is already running${NC}"
    echo "  PID: $(pgrep -f 'velo.*telegram')"
    exit 0
fi

# Check for token - prioritize exported variable over file
if [ -n "$TELEGRAM_TOKEN" ]; then
    # Save to env file for persistence
    mkdir -p "$VELO_HOME"
    echo "TELEGRAM_TOKEN=$TELEGRAM_TOKEN" > "$ENV_FILE"
    echo "✓ Saved TELEGRAM_TOKEN to $ENV_FILE"
elif [ -f "$ENV_FILE" ]; then
    # Load from existing env file
    export $(grep -v '^#' "$ENV_FILE" | xargs)
    echo "✓ Loaded TELEGRAM_TOKEN from $ENV_FILE"
else
    echo "✗ TELEGRAM_TOKEN not found!"
    echo ""
    echo "Set it one of these ways:"
    echo "  1. Export: export TELEGRAM_TOKEN=123456:ABC-DEF..."
    echo "  2. Create $ENV_FILE with:"
    echo "     TELEGRAM_TOKEN=123456:ABC-DEF..."
    echo ""
    echo "Get a token from @BotFather on Telegram"
    exit 1
fi

# Ensure velo binary exists
if ! command -v velo &> /dev/null; then
    echo "Installing velo..."
    curl -fsSL https://raw.githubusercontent.com/drakelarson/velo/master/install.sh | bash
fi

# Start the bot
echo "Starting Velo..."
cd "$VELO_HOME"
nohup velo telegram > /tmp/velo_bot.log 2>&1 &

sleep 2

if pgrep -f "velo.*telegram" > /dev/null; then
    echo -e "${GREEN}✓ Velo started!${NC}"
    echo "  PID: $(pgrep -f 'velo.*telegram')"
    echo "  Bot: $(grep 'Connected as' /tmp/velo_bot.log | head -1)"
    echo "  Log: /tmp/velo_bot.log"
else
    echo "✗ Failed to start. Check /tmp/velo_bot.log"
    exit 1
fi
