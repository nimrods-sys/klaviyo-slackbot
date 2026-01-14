import { SlackCommandMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { KlaviyoClient } from '../klaviyo/client';

export function createCampaignRevenueHandler(klaviyoClient: KlaviyoClient) {
  return async ({
    command,
    ack,
    respond,
  }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) => {
    // Acknowledge the command request immediately
    await ack();

    const dateInput = command.text.trim();

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateInput || !dateRegex.test(dateInput)) {
      await respond({
        text: 'Please provide a valid date in YYYY-MM-DD format.\n\nExample: `/campaign-revenue 2024-01-15`',
        response_type: 'in_channel',
      });
      return;
    }

    // Validate that it's a valid date
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) {
      await respond({
        text: 'Invalid date provided. Please use a valid date in YYYY-MM-DD format.',
        response_type: 'in_channel',
      });
      return;
    }

    try {
      // Fetch campaigns and revenue
      const campaigns = await klaviyoClient.getCampaignsByDate(dateInput);

      if (campaigns.length === 0) {
        await respond({
          text: `No campaigns found for ${dateInput}.`,
          response_type: 'in_channel',
        });
        return;
      }

      // Calculate total revenue
      const totalRevenue = campaigns.reduce((sum, campaign) => sum + campaign.revenue, 0);

      // Format the response
      const campaignLines = campaigns
        .map((campaign) => {
          const formattedRevenue = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(campaign.revenue);
          return `• "${campaign.campaignName}" - ${formattedRevenue}`;
        })
        .join('\n');

      const formattedTotal = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(totalRevenue);

      const responseText = [
        `📊 *Campaigns for ${dateInput}:*\n`,
        campaignLines,
        '',
        `*Total Revenue:* ${formattedTotal}`,
      ].join('\n');

      await respond({
        text: responseText,
        response_type: 'in_channel',
      });
    } catch (error) {
      console.error('Error handling campaign-revenue command:', error);

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred';

      await respond({
        text: `Unable to fetch campaign data from Klaviyo.\n\nError: ${errorMessage}\n\nPlease check your Klaviyo API key and try again.`,
        response_type: 'in_channel',
      });
    }
  };
}
