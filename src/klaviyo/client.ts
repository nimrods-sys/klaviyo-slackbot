import axios, { AxiosInstance } from 'axios';
import {
  KlaviyoCampaignsResponse,
  KlaviyoMetricAggregateResponse,
  CampaignRevenue,
} from './types';

export class KlaviyoClient {
  private client: AxiosInstance;
  private readonly apiVersion = '2024-10-15';

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: 'https://a.klaviyo.com/api',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'revision': this.apiVersion,
        'Content-Type': 'application/json',
      },
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getCampaignsByDate(date: string): Promise<CampaignRevenue[]> {
    try {
      // Fetch campaigns with pagination (limited to recent campaigns only)
      let allCampaigns: any[] = [];
      let nextUrl: string | undefined = undefined;
      let pageCount = 0;

      const targetDateStr = new Date(date).toISOString().split('T')[0];
      console.log(`Looking for campaigns on date: ${targetDateStr}`);

      do {
        const response: { data: KlaviyoCampaignsResponse } = await this.client.get<KlaviyoCampaignsResponse>(
          nextUrl || '/campaigns',
          {
            params: nextUrl ? undefined : {
              'filter': `equals(status,"Sent")`,
            },
          }
        );

        if (response.data.data && response.data.data.length > 0) {
          allCampaigns = allCampaigns.concat(response.data.data);
          pageCount++;
          console.log(`Fetched page ${pageCount}: ${response.data.data.length} campaigns`);
        }

        nextUrl = response.data.links?.next;
      } while (nextUrl && pageCount < 5); // Limit to 5 pages for faster performance

      if (allCampaigns.length === 0) {
        console.log('No campaigns returned from Klaviyo API');
        return [];
      }

      console.log(`Found ${allCampaigns.length} total campaigns from Klaviyo`);

      // Filter campaigns by the specified date (client-side)
      const campaignsOnDate = allCampaigns.filter((campaign) => {
        const sendTime = campaign.attributes.send_time ||
                        campaign.attributes.scheduled_at ||
                        campaign.attributes.send_strategy?.options_static?.datetime;

        if (!sendTime) {
          return false;
        }

        const campaignDate = new Date(sendTime).toISOString().split('T')[0];
        return campaignDate === targetDateStr;
      });

      console.log(`Filtered to ${campaignsOnDate.length} campaigns matching ${targetDateStr}`);

      // Fetch revenue for each campaign sequentially to avoid rate limits
      const results: CampaignRevenue[] = [];
      for (const campaign of campaignsOnDate) {
        const revenue = await this.getCampaignRevenue(campaign.id, campaign.attributes.name, date);
        results.push({
          campaignId: campaign.id,
          campaignName: campaign.attributes.name,
          revenue,
          sendTime: campaign.attributes.send_time || campaign.attributes.scheduled_at,
        });

        // Add a small delay between requests to avoid rate limits
        if (results.length < campaignsOnDate.length) {
          await this.sleep(500); // 500ms delay between requests
        }
      }

      return results;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Klaviyo API error:', error.response?.data || error.message);
        throw new Error(`Failed to fetch campaigns: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
      }
      throw error;
    }
  }

  private readonly placedOrderMetricId: string = 'TdrsKG';

  private getPlacedOrderMetricId(): string {
    return this.placedOrderMetricId;
  }

  private async getCampaignRevenue(campaignId: string, campaignName: string, campaignDate: string): Promise<number> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        if (retryCount > 0) {
          console.log(`Retry attempt ${retryCount} for campaign: ${campaignName}`);
        } else {
          console.log(`\n=== Fetching revenue for campaign: ${campaignName} ===`);
          console.log(`Campaign ID: ${campaignId}`);
        }

        // Get the Placed Order metric ID
        const metricId = this.getPlacedOrderMetricId();
        if (retryCount === 0) {
          console.log(`Using Placed Order metric ID: ${metricId}`);
        }

        // Use the correct POST endpoint for campaign values reports
        const response = await this.client.post('/campaign-values-reports/', {
          data: {
            type: 'campaign-values-report',
            attributes: {
              statistics: ['conversions', 'conversion_uniques', 'conversion_value'],
              filter: `equals(campaign_id,"${campaignId}")`,
              conversion_metric_id: metricId,
              timeframe: {
                key: 'last_365_days'
              }
            }
          }
        });

        console.log('Campaign values response:', JSON.stringify(response.data, null, 2));

        const results = response.data.data?.attributes?.results;
        if (results && results.length > 0) {
          const conversionValue = results[0]?.statistics?.conversion_value;
          if (conversionValue !== undefined && conversionValue !== null) {
            console.log(`✓ Revenue for "${campaignName}": $${conversionValue}`);
            return conversionValue;
          }
        }

        console.log(`No revenue data found for campaign ${campaignName}`);
        return 0;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          // Handle rate limiting with retry
          if (status === 429 && retryCount < maxRetries) {
            const retryAfter = error.response?.data?.errors?.[0]?.detail?.match(/(\d+)\s+second/)?.[1];
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retryCount) * 1000;

            console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
            await this.sleep(waitTime);
            retryCount++;
            continue;
          }

          console.error(`Error fetching revenue for campaign ${campaignName} (${campaignId}):`);
          console.error('Status:', status);
          console.error('Error data:', JSON.stringify(error.response?.data, null, 2));
        }
        return 0;
      }
    }

    console.error(`Failed to fetch revenue for ${campaignName} after ${maxRetries} retries`);
    return 0;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with campaigns endpoint since that's what we actually use
      await this.client.get('/campaigns');
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Klaviyo connection test failed:');
        console.error('Status:', error.response?.status);
        console.error('Error details:', JSON.stringify(error.response?.data, null, 2));
      } else {
        console.error('Klaviyo connection test failed:', error);
      }
      return false;
    }
  }
}
