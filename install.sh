#!/bin/bash
# Velo Installer - Works on any Linux/macOS machine

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

# Download binary (or build from source)
if [ "$(uname -m)" = "x86_64" ]; then
    echo "Downloading Velo binary..."
    # For now, clone and build
    cd /tmp
    git clone https://github.com/drakelarson/velo.git velo-build
    cd velo-build
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
else
    echo "Building from source for $(uname -m)..."
    cd /tmp
    git clone https://github.com/drakelarson/velo.git velo-build
    cd velo-build
    bun run build
    sudo cp dist/velo /usr/local/bin/velo
    sudo mkdir -p /usr/local/share/velo
    sudo cp -r dashboard /usr/local/share/velo/
    sudo cp -r bridge /usr/local/share/velo/
    cd /
    rm -rf /tmp/velo-build
fi

# Create default config
if [ ! -f "$HOME/.velo/velo.toml" ]; then
    echo "Creating default config..."
    cat > "$HOME/.velo/velo.toml" << 'CONF'
[agent]
name = "Velo"
personality = "Helpful, concise AI assistant"
model = "nvidia:stepfun-ai/step-3.5-flash"

[providers.nvidia]
api_key_env = "NVIDIA_API_KEY"
base_url = "https://integrate.api.nvidia.com/v1"

[providers.openai]
api_key_env = "OPENAI_API_KEY"

[providers.google]
api_key_env = "GOOGLE_API_KEY"

[providers.minimax]
api_key_env = "MINIMAX_API_KEY"
base_url = "https://api.minimaxi.com/v1"

[memory]
path = "/root/.velo/data/velo.db"
max_context_messages = 50

[compaction]
enabled = true
model = "google:gemma-3-4b-it"
reflectionModel = "google:gemma-3-4b-it"
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
echo "  1. Set API key:"
echo "     echo 'NVIDIA_API_KEY=your-key' >> ~/.velo/velo.env"
echo ""
echo "  2. Run Velo:"
echo "     velo chat \"Hello!\""
echo ""
echo "  3. Dashboard:"
echo "     velo dashboard"
echo "     → http://localhost:3333"
echo ""
echo "  4. Telegram bot:"
echo "     velo telegram YOUR_BOT_TOKEN"
echo ""
echo "  5. WhatsApp:"
echo "     velo whatsapp login"
echo ""