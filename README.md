# Klaviyo Campaign Revenue Slackbot

A Slack bot that integrates with Klaviyo's API to fetch campaign information and revenue data by date. Simply provide a date, and the bot will tell you what campaigns were sent that day and how much revenue they generated.

## Features

- Slash command interface: `/campaign-revenue YYYY-MM-DD`
- `/emails-sent [YYYY-MM-DD]`: how many people campaigns emailed on a day vs. the same weekday last year
- Fetches all campaigns sent on a specific date
- Displays revenue for each campaign
- Shows total revenue across all campaigns
- Socket Mode for easy local development (no public URL needed)

## Prerequisites

- Node.js 18 or higher
- A Slack workspace where you can install apps
- A Klaviyo account with API access

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click "Create New App"
2. Choose "From scratch"
3. Name it "Klaviyo Campaign Reporter" and select your workspace
4. Click "Create App"

#### Enable Socket Mode
1. Go to "Settings" > "Socket Mode" in the sidebar
2. Toggle "Enable Socket Mode" to ON
3. Click "Generate" to create an App-Level Token
   - Token Name: `websocket`
   - Scope: `connections:write`
4. Copy the token (starts with `xapp-`) - you'll need this for `SLACK_APP_TOKEN`

#### Add Bot Token Scopes
1. Go to "Features" > "OAuth & Permissions"
2. Scroll down to "Scopes" > "Bot Token Scopes"
3. Add the following scopes:
   - `commands` - Add shortcuts and/or slash commands
   - `chat:write` - Send messages as the bot
4. Scroll up and click "Install to Workspace"
5. Authorize the app
6. Copy the "Bot User OAuth Token" (starts with `xoxb-`) - you'll need this for `SLACK_BOT_TOKEN`

#### Create Slash Command
1. Go to "Features" > "Slash Commands"
2. Click "Create New Command"
3. Fill in the details:
   - **Command**: `/campaign-revenue`
   - **Short Description**: "Get campaign revenue for a specific date"
   - **Usage Hint**: `YYYY-MM-DD` (e.g., 2024-01-15)
4. Click "Save"
5. Create a second command the same way:
   - **Command**: `/emails-sent`
   - **Short Description**: "People emailed by campaigns vs. same weekday last year"
   - **Usage Hint**: `[YYYY-MM-DD]` (optional, defaults to today)

### 3. Get Klaviyo API Key

1. Log into your Klaviyo account
2. Go to "Settings" (gear icon) > "API Keys"
3. Click "Create Private API Key"
4. Name it "Slack Bot" or similar
5. Select the following permissions:
   - **Campaigns**: Read
   - **Metrics**: Read
   - **Accounts**: Read (optional, lets `/emails-sent` use your account timezone)
6. Click "Create"
7. Copy the Private API Key (starts with `pk_`)

### 4. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in your credentials:
   ```bash
   SLACK_BOT_TOKEN=xoxb-your-bot-token-here
   SLACK_APP_TOKEN=xapp-your-app-token-here
   KLAVIYO_API_KEY=pk_your-private-key-here
   ```

## Running the Bot

### Development Mode
```bash
npm run dev
```

This will start the bot with auto-reload on file changes.

### Production Mode
```bash
npm run build
npm start
```

When the bot starts successfully, you should see:
```
Starting Klaviyo Campaign Revenue Slackbot...
Testing Klaviyo API connection...
✓ Successfully connected to Klaviyo API
⚡️ Bolt app is running!
Ready to receive /campaign-revenue commands
```

## Usage

In any Slack channel where the bot is present, use the slash command:

```
/campaign-revenue 2024-01-15
```

The bot will respond with:
```
📊 Campaigns for 2024-01-15:

• "New Year Sale" - $12,450.00
• "Product Launch" - $8,320.50
• "Newsletter #42" - $3,210.00

Total Revenue: $23,980.50
```

If no campaigns were sent on that date:
```
No campaigns found for 2024-01-15.
```

### Emails sent vs. last year

```
/emails-sent 2026-11-19
```

Compares the day with the **same weekday one year earlier** (52 weeks / 364 days back), so
Thu Nov 19 2026 is compared with Thu Nov 20 2025:

```
📧 People emailed by campaigns: Thu, Nov 19, 2026 vs Thu, Nov 20, 2025
Full day, America/New_York.

Thu, Nov 19, 2026: 412,345 people
Thu, Nov 20, 2025: 380,000 people

🟢 32,345 more people emailed than last year
```

- Counts unique people who received at least one **campaign** email that day. Flow emails are not counted.
- 🟢 means more people than last year, 🔴 means fewer. A day with no campaign emails shows "none".
- With no date it uses today, and last year is counted only up to the same time of day so the comparison is fair.
- A "day" is defined in `KLAVIYO_TIMEZONE` if set, otherwise the Klaviyo account timezone, otherwise UTC.

## Date Format

- Use YYYY-MM-DD format (e.g., 2024-01-15)
- Invalid formats will prompt an error message
- Dates are matched against campaign send times in Klaviyo

## Troubleshooting

### Bot doesn't respond to commands
- Verify the bot is running (check terminal output)
- Ensure Socket Mode is enabled in Slack app settings
- Check that the bot is installed in your workspace
- Verify your `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are correct

### "Unable to fetch campaign data from Klaviyo"
- Verify your `KLAVIYO_API_KEY` is correct
- Ensure the API key has "Read Campaigns" and "Read Metrics" permissions
- Check if you have campaigns in Klaviyo

### "No campaigns found for [date]"
- Verify campaigns were actually sent on that date in Klaviyo dashboard
- Check timezone - Klaviyo uses UTC times
- Ensure campaigns have status "Sent"

### Connection errors on startup
- Check your internet connection
- Verify all environment variables are set correctly
- Ensure your API keys haven't expired

## Project Structure

```
klaviyo-slack-bot/
├── src/
│   ├── index.ts              # Main app entry point
│   ├── config.ts             # Environment configuration
│   ├── klaviyo/
│   │   ├── client.ts         # Klaviyo API client
│   │   └── types.ts          # TypeScript types
│   ├── slack/
│   │   ├── commands.ts       # /campaign-revenue handler
│   │   └── emailsSent.ts     # /emails-sent handler
│   └── utils/
│       └── dates.ts          # Date / timezone helpers
├── .env                      # Environment variables (not in git)
├── .env.example              # Template for env vars
├── package.json
├── tsconfig.json
└── README.md
```

## Technical Details

- **Slack Framework**: @slack/bolt with Socket Mode
- **Klaviyo API**: v2024-10-15 (REST API)
- **Runtime**: Node.js with TypeScript
- **HTTP Client**: Axios

## Security Notes

- Never commit your `.env` file to version control
- Keep your API keys secure
- Rotate keys if they're ever exposed
- Use environment-specific keys (dev/prod)

## License

ISC
