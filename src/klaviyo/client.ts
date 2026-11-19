import axios, { AxiosInstance } from 'axios';
import {
  KlaviyoCampaignsResponse,
  KlaviyoMetricAggregateResponse,
  KlaviyoMetricsResponse,
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

      const targetDateStr = new Date(date).toISOString().split('T')[0];
      console.log(`Looking for campaigns on date: ${targetDateStr}`);

      // Fetch both email and SMS campaigns (Klaviyo requires channel filter)
      const channels = ['email', 'sms'];

      for (const channel of channels) {
        let nextUrl: string | undefined = undefined;
        let pageCount = 0;

        console.log(`Fetching ${channel} campaigns...`);

        do {
          const response: { data: KlaviyoCampaignsResponse } = await this.client.get<KlaviyoCampaignsResponse>(
            nextUrl || '/campaigns',
            {
              params: nextUrl ? undefined : {
                'filter': `equals(messages.channel,"${channel}"),equals(status,"Sent")`,
              },
            }
          );

          if (response.data.data && response.data.data.length > 0) {
            allCampaigns = allCampaigns.concat(response.data.data);
            pageCount++;
            console.log(`Fetched ${channel} page ${pageCount}: ${response.data.data.length} campaigns`);
          }

          nextUrl = response.data.links?.next;
        } while (nextUrl && pageCount < 5); // Limit to 5 pages per channel
      }

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

  private receivedEmailMetricId?: string;

  /** Retry a request on 429 rate limit responses with backoff. */
  private async withRateLimitRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < maxRetries) {
          const retryAfterHeader = Number(error.response.headers?.['retry-after']);
          const waitMs = retryAfterHeader > 0 ? retryAfterHeader * 1000 : Math.pow(2, attempt) * 1000;
          console.log(`Rate limited. Waiting ${waitMs}ms before retry...`);
          await this.sleep(waitMs);
          continue;
        }
        throw error;
      }
    }
  }

  /** Find (and cache) the ID of Klaviyo's built-in "Received Email" metric. */
  private async getReceivedEmailMetricId(): Promise<string> {
    if (this.receivedEmailMetricId) return this.receivedEmailMetricId;

    let nextUrl: string | undefined = '/metrics';
    while (nextUrl) {
      const url: string = nextUrl;
      const response = await this.withRateLimitRetry(() => this.client.get<KlaviyoMetricsResponse>(url));
      const match = response.data.data.find(
        (m) => m.attributes.name === 'Received Email' && (m.attributes.integration?.name ?? 'Klaviyo') === 'Klaviyo'
      );
      if (match) {
        this.receivedEmailMetricId = match.id;
        console.log(`Using Received Email metric ID: ${match.id}`);
        return match.id;
      }
      nextUrl = response.data.links?.next ?? undefined;
    }

    throw new Error('Could not find the "Received Email" metric in this Klaviyo account.');
  }

  /**
   * Count unique people who received a campaign email between `start` (inclusive) and `end` (exclusive).
   * Both are ISO 8601 timestamps with an explicit offset. Flow emails are excluded.
   * `timeZone` controls how Klaviyo buckets the results into days.
   */
  async getCampaignRecipients(start: string, end: string, timeZone: string): Promise<number> {
    try {
      const metricId = await this.getReceivedEmailMetricId();

      // Group by flow: flow emails land in one row per flow, campaign emails (no flow)
      // land in the row whose flow dimension is empty.
      const response = await this.withRateLimitRetry(() =>
        this.client.post<KlaviyoMetricAggregateResponse>('/metric-aggregates/', {
          data: {
            type: 'metric-aggregate',
            attributes: {
              metric_id: metricId,
              measurements: ['unique'],
              interval: 'day',
              by: ['$flow'],
              timezone: timeZone,
              filter: [`greater-or-equal(datetime,${start})`, `less-than(datetime,${end})`],
            },
          },
        })
      );

      const rows = response.data.data.attributes.data ?? [];
      const campaignRows = rows.filter((row) => !row.dimensions?.[0]);
      console.log(
        `Received Email ${start} -> ${end}: ${rows.length} rows, flow dimensions:`,
        rows.map((row) => row.dimensions?.[0] ?? '(none)')
      );

      // The window sits inside a single local day, so there is one day bucket and
      // summing "unique" does not double count people.
      const recipients = campaignRows.reduce(
        (total, row) => total + (row.measurements.unique ?? []).reduce((a, b) => a + (b ?? 0), 0),
        0
      );
      console.log(`Campaign recipients ${start} -> ${end}: ${recipients}`);
      return recipients;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Klaviyo API error:', error.response?.data || error.message);
        throw new Error(`Failed to fetch campaign recipients: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
      }
      throw error;
    }
  }

  /** The account's timezone as configured in Klaviyo (needs the Accounts: Read scope). */
  async getAccountTimezone(): Promise<string | undefined> {
    try {
      const response = await this.client.get('/accounts');
      return response.data?.data?.[0]?.attributes?.timezone || undefined;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      console.warn(`Could not read Klaviyo account timezone (status ${status ?? 'n/a'}).`);
      return undefined;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with campaigns endpoint since that's what we actually use
      await this.client.get('/campaigns', {
        params: {
          'filter': 'equals(messages.channel,"email")',
        },
      });
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
