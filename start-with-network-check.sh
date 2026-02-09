#!/bin/bash
# Startup script that waits for network before starting the bot

LOG_FILE="/Users/nimrods/Code/klaviyo-slack-bot/logs/startup.log"
mkdir -p "$(dirname "$LOG_FILE")"

echo "$(date): Starting Klaviyo Slack Bot with network check..." >> "$LOG_FILE"

# Wait for network to be available (max 30 seconds)
MAX_WAIT=30
COUNTER=0

while [ $COUNTER -lt $MAX_WAIT ]; do
    if ping -c 1 -W 2 8.8.8.8 &> /dev/null; then
        echo "$(date): Network is available, starting bot..." >> "$LOG_FILE"
        break
    fi

    echo "$(date): Waiting for network... ($COUNTER/$MAX_WAIT)" >> "$LOG_FILE"
    sleep 3
    COUNTER=$((COUNTER + 3))
done

if [ $COUNTER -ge $MAX_WAIT ]; then
    echo "$(date): Network timeout after ${MAX_WAIT}s, starting anyway (bot will retry)..." >> "$LOG_FILE"
fi

# Change to bot directory and start
cd /Users/nimrods/Code/klaviyo-slack-bot
exec /usr/local/bin/node /Users/nimrods/Code/klaviyo-slack-bot/dist/index.js
