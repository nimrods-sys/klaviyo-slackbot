import { App } from '@slack/bolt';
import { config } from './config';
import { KlaviyoClient } from './klaviyo/client';
import { createCampaignRevenueHandler } from './slack/commands';
import { createEmailsSentHandler } from './slack/emailsSent';

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('Starting Klaviyo Campaign Revenue Slackbot...');

  // Initialize Klaviyo client
  const klaviyoClient = new KlaviyoClient(config.klaviyo.apiKey);

  // Test Klaviyo connection
  console.log('Testing Klaviyo API connection...');
  const isKlaviyoConnected = await klaviyoClient.testConnection();
  if (!isKlaviyoConnected) {
    console.error('Failed to connect to Klaviyo API. Please check your API key.');
    process.exit(1);
  }
  console.log('✓ Successfully connected to Klaviyo API');

  // Timezone that defines a "day" for /emails-sent: KLAVIYO_TIMEZONE, else the Klaviyo account's, else UTC
  let timeZone = config.klaviyo.timezone || (await klaviyoClient.getAccountTimezone()) || 'UTC';
  if (!isValidTimezone(timeZone)) {
    console.warn(`Invalid timezone "${timeZone}", falling back to UTC`);
    timeZone = 'UTC';
  }
  console.log(`Using timezone: ${timeZone}`);

  // Initialize Slack app with Socket Mode
  const app = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    socketMode: true,
  });

  // Register slash command handler
  app.command('/campaign-revenue', createCampaignRevenueHandler(klaviyoClient));
  app.command('/emails-sent', createEmailsSentHandler(klaviyoClient, timeZone));

  // Start the app
  await app.start();

  console.log('⚡️ Bolt app is running!');
  console.log('Ready to receive /campaign-revenue and /emails-sent commands');
}

main().catch((error) => {
  console.error('Failed to start the bot:', error);
  process.exit(1);
});
