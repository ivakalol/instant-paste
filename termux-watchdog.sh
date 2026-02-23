#!/data/data/com.termux/files/usr/bin/bash

# Configuration
# NOTE: Verify this path matches your Termux folder structure.
# If you cloned into ~/GitHub/instant-paste, this might need to be changed to:
# WEBSITE_DIR="$HOME/GitHub/instant-paste/"
WEBSITE_DIR="$HOME/GitHub/instant-paste/instant-paste/"
TUNNEL_NAME="instant-paste-tunnel"
LOG_FILE="$HOME/watchdog.log"

while true; do
    # 1. Check SSHD (runs as a standalone process)
    if ! pgrep -x "sshd" > /dev/null; then
        sshd
        echo "$(date): Started sshd" >> "$LOG_FILE"
    fi

    # 2. Check TMUX Session: server (Cloudflared)
    if ! tmux has-session -t server 2>/dev/null; then
        tmux new-session -d -s server
        tmux send-keys -t server "cloudflared tunnel run $TUNNEL_NAME" C-m
        echo "$(date): Restarted server session (tunnel)" >> "$LOG_FILE"
    fi

    # 3. Check TMUX Session: website (NPM)
    if ! tmux has-session -t website 2>/dev/null; then
        tmux new-session -d -s website
        # Ensure we are in the correct directory before running commands
        tmux send-keys -t website "cd $WEBSITE_DIR && npm run build && npm run start" C-m
        echo "$(date): Restarted website session (npm)" >> "$LOG_FILE"
    fi

    # Wait 30 seconds before checking again
    sleep 30
done
