# Klaviyo Slack Bot - LaunchAgent Management

The Klaviyo Slack bot is now configured to run automatically via macOS LaunchAgent.

## Current Status

✅ **Bot is running** and will:
- Start automatically when you log in
- Auto-restart if it crashes (with 60-second throttle to prevent rapid restarts)
- Keep running in the background

## Useful Commands

### Check if bot is running
```bash
launchctl list | grep klaviyo
```
If you see an exit code of `0`, it's running successfully.

### View bot status
```bash
launchctl print gui/$(id -u)/com.nimrods.klaviyo-slack-bot
```

### View logs
```bash
# Startup and normal output
tail -f ~/klaviyo-slack-bot/logs/bot.log

# Error logs
tail -f ~/klaviyo-slack-bot/logs/bot-error.log
```

### Stop the bot
```bash
launchctl unload ~/Library/LaunchAgents/com.nimrods.klaviyo-slack-bot.plist
```

### Start the bot
```bash
launchctl load ~/Library/LaunchAgents/com.nimrods.klaviyo-slack-bot.plist
```

### Restart the bot
```bash
launchctl kickstart -k gui/$(id -u)/com.nimrods.klaviyo-slack-bot
```

## Files

- **LaunchAgent config**: `~/Library/LaunchAgents/com.nimrods.klaviyo-slack-bot.plist`
- **Bot code**: `~/klaviyo-slack-bot/`
- **Logs**: `~/klaviyo-slack-bot/logs/`

## Troubleshooting

If the bot stops working:

1. Check logs for errors:
   ```bash
   cat ~/klaviyo-slack-bot/logs/bot-error.log
   ```

2. Verify environment variables are set in `.env`:
   - `SLACK_BOT_TOKEN`
   - `SLACK_APP_TOKEN`
   - `KLAVIYO_API_KEY`

3. Restart the bot:
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.nimrods.klaviyo-slack-bot
   ```

4. If code changes were made, rebuild first:
   ```bash
   cd ~/klaviyo-slack-bot
   npm run build
   launchctl kickstart -k gui/$(id -u)/com.nimrods.klaviyo-slack-bot
   ```

## Available Slack Commands

- `/campaign-revenue YYYY-MM-DD` - Get campaign revenue for a specific date
  - Example: `/campaign-revenue 2026-01-25`
