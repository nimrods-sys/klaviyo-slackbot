import dotenv from 'dotenv';

dotenv.config();

interface Config {
  slack: {
    botToken: string;
    appToken: string;
  };
  klaviyo: {
    apiKey: string;
  };
}

function validateConfig(): Config {
  const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN, KLAVIYO_API_KEY } = process.env;

  if (!SLACK_BOT_TOKEN) {
    throw new Error('SLACK_BOT_TOKEN is required. Please set it in your .env file.');
  }

  if (!SLACK_APP_TOKEN) {
    throw new Error('SLACK_APP_TOKEN is required. Please set it in your .env file.');
  }

  if (!KLAVIYO_API_KEY) {
    throw new Error('KLAVIYO_API_KEY is required. Please set it in your .env file.');
  }

  return {
    slack: {
      botToken: SLACK_BOT_TOKEN,
      appToken: SLACK_APP_TOKEN,
    },
    klaviyo: {
      apiKey: KLAVIYO_API_KEY,
    },
  };
}

export const config = validateConfig();
