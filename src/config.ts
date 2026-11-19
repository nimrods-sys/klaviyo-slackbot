import dotenv from 'dotenv';

dotenv.config();

interface Config {
  slack: {
    botToken: string;
    appToken: string;
  };
  klaviyo: {
    apiKey: string;
    /** Optional IANA timezone (e.g. "America/New_York") used to define a "day". */
    timezone?: string;
  };
}

function validateConfig(): Config {
  const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN, KLAVIYO_API_KEY, KLAVIYO_TIMEZONE } = process.env;

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
      timezone: KLAVIYO_TIMEZONE || undefined,
    },
  };
}

export const config = validateConfig();
