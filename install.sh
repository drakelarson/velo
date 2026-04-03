#!/bin/bash
# Velo Installer - Works on any Linux/macOS machine
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/drakelarson/velo/master/install.sh | bash
#   curl -fsSL ... | bash uninstall   # uninstall

# ── Uninstall ────────────────────────────────────────────────────────────────
if [ "$1" = "--uninstall" ] || [ "$1" = "uninstall" ]; then
  echo ""
  echo "▓▓▓  Uninstalling Velo  ▓▓▓"
  echo ""

  pkill -f "velo" 2>/dev/null || true
  echo "✓ Stopped running processes"

  if [ -f /usr/local/bin/velo ]; then
    sudo rm -f /usr/local/bin/velo && echo "✓ Removed /usr/local/bin/velo"
  fi

  if [ -d /usr/local/share/velo ]; then
    sudo rm -rf /usr/local/share/velo && echo "✓ Removed /usr/local/share/velo"
  fi

  echo ""
  read -p "Remove ~/.velo data directory? (y/N): " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$HOME/.velo" && echo "✓ Removed ~/.velo"
  else
    echo "Skipped ~/.velo (data kept at $HOME/.velo)"
  fi

  echo ""
  echo "✓ Velo uninstalled. Goodbye!"
  exit 0
fi

# ── Install ──────────────────────────────────────────────────────────────────
set -e

echo "╔══════════════════════════════════╗"
echo "║     Velo AI Agent Installer      ║"
echo "╚══════════════════════════════════╝"
echo ""

# Check for dependencies
if ! command -v bun &> /dev/null; then
    echo "Installing Bun runtime..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
fi

# Create directories
mkdir -p "$HOME/.velo/data"
mkdir -p "$HOME/.velo/plugins"
mkdir -p "$HOME/.velo/bridge"

# Clone, install deps, build
cd /tmp
rm -rf velo-build
git clone https://github.com/drakelarson/velo.git velo-build
cd velo-build
bun install
bun run build

# Install binary
sudo cp dist/velo /usr/local/bin/velo

# Copy dashboard files
sudo mkdir -p /usr/local/share/velo
sudo cp -r dashboard /usr/local/share/velo/
sudo cp -r bridge /usr/local/share/velo/

# Cleanup
cd /
rm -rf /tmp/velo-build

echo ""
echo "✓ Velo installed to /usr/local/bin/velo"

# Create default config
if [ ! -f "$HOME/.velo/velo.toml" ]; then
    echo "Creating default config..."
    cat > "$HOME/.velo/velo.toml" << 'CONF'
[agent]
name = "Velo"
personality = "Helpful, concise AI assistant"
model = "nvidia:stepfun-ai/step-3.5-flash"

[providers.nvidia]
api_key = "your-nvidia-api-key"
base_url = "https://integrate.api.nvidia.com/v1"

[providers.openai]
api_key = "your-openai-api-key"

[providers.google]
api_key = "your-google-api-key"

[providers.minimax]
api_key = "your-minimax-api-key"
base_url = "https://api.minimaxi.com/v1"

[memory]
path = "/root/.velo/data/velo.db"
max_context_messages = 50

[compaction]
enabled = true
model = "google:gemma-3-4b-it"
reflection_model = "google:gemma-3-4b-it"
trigger_threshold = 40
keep_recent = 10

[channels.webhook]
enabled = true
port = 3000

[channels.telegram]
enabled = false
token_env = "TELEGRAM_BOT_TOKEN"

[scheduler]
enabled = false

[skills]
directory = "/usr/local/share/velo/skills"
auto_load = true
CONF
fi

echo ""
echo "╔══════════════════════════════════╗"
echo "║        Installation Done!        ║"
echo "╚══════════════════════════════════╝"
echo ""
echo "Quick Start:"
echo "  1. Edit config (paste your API keys):"
echo "     nano ~/.velo/velo.toml"
echo "     → Replace 'your-nvidia-api-key' etc. with real keys"
echo ""
echo "  2. Run Velo:"
echo "     velo chat \"Hello!\""
echo ""
echo "  3. Telegram bot:"
echo "     velo telegram YOUR_BOT_TOKEN"
echo ""
echo "  4. Compaction settings:"
echo "     velo compaction           # see current settings"
echo "     velo compaction on/off   # enable/disable"
echo "     velo compaction threshold 50  # compact after N messages"
echo ""
echo "  To uninstall:"
echo "     curl -fsSL ... | bash uninstall"
