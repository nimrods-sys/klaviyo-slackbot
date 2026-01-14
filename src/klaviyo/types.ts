export interface KlaviyoCampaign {
  type: string;
  id: string;
  attributes: {
    name: string;
    status: string;
    archived: boolean;
    audiences: {
      included: string[];
      excluded: string[];
    };
    send_options: {
      use_smart_sending: boolean;
      is_transactional: boolean;
    };
    tracking_options: {
      is_add_utm: boolean;
      utm_params: Array<{
        name: string;
        value: string;
      }>;
      is_tracking_clicks: boolean;
      is_tracking_opens: boolean;
    };
    send_strategy: {
      method: string;
      options_static: {
        datetime: string;
        is_local: boolean;
        send_past_recipients_immediately: boolean;
      };
    };
    created_at: string;
    scheduled_at: string;
    updated_at: string;
    send_time?: string;
  };
  relationships?: {
    campaign_messages?: {
      data: Array<{
        type: string;
        id: string;
      }>;
    };
  };
}

export interface KlaviyoCampaignsResponse {
  data: KlaviyoCampaign[];
  links?: {
    self: string;
    next?: string;
    prev?: string;
  };
}

export interface KlaviyoMetricAggregateQuery {
  data: {
    type: string;
    attributes: {
      metric_id: string;
      measurements: string[];
      interval?: string;
      page_size?: number;
      timezone?: string;
      filter?: string[];
      sort?: string;
    };
  };
}

export interface KlaviyoMetricAggregateResponse {
  data: {
    type: string;
    id: string;
    attributes: {
      data: Array<{
        attributes: {
          metric_id: string;
          campaign_id?: string;
          flow_id?: string;
          measurements: {
            sum_value?: number;
            count?: number;
            unique?: number;
          };
          dimensions?: string[];
        };
      }>;
    };
  };
}

export interface CampaignRevenue {
  campaignId: string;
  campaignName: string;
  revenue: number;
  sendTime?: string;
}
