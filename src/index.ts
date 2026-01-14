import { App } from '@slack/bolt';
import { config } from './config';
import { KlaviyoClient } from './klaviyo/client';
import { createCampaignRevenueHandler } from './slack/commands';

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

  // Initialize Slack app with Socket Mode
  const app = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    socketMode: true,
  });

  // Register slash command handler
  app.command('/campaign-revenue', createCampaignRevenueHandler(klaviyoClient));

  // Start the app
  await app.start();

  console.log('⚡️ Bolt app is running!');
  console.log('Ready to receive /campaign-revenue commands');
}

main().catch((error) => {
  console.error('Failed to start the bot:', error);
  process.exit(1);
});
