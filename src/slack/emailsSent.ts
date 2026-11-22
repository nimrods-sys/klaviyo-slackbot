import { SlackCommandMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { KlaviyoClient } from '../klaviyo/client';
import { CampaignRates } from '../klaviyo/types';
import {
  addDays,
  formatPrettyDate,
  localToIso,
  nowInTimezone,
  parseIsoDate,
  sameWeekdayLastYear,
} from '../utils/dates';

const numberFormat = new Intl.NumberFormat('en-US');

function formatPeople(count: number): string {
  return count === 0 ? 'none' : `${numberFormat.format(count)} people`;
}

function formatPercent(fraction: number, decimals: number): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

function formatRates(rates: CampaignRates | null): string | null {
  if (!rates) return 'Open rate, CTR and CVR unavailable right now';
  if (rates.delivered === 0) return null;
  return [
    `Open rate ${formatPercent(rates.openRate, 1)}`,
    `CTR ${formatPercent(rates.clickRate, 2)}`,
    `CVR ${formatPercent(rates.conversionRate, 2)}`,
  ].join(' · ');
}

/** Rates are nice to have: if the report fails, still show the people counts. */
async function getRatesOrNull(klaviyoClient: KlaviyoClient, start: string, end: string): Promise<CampaignRates | null> {
  try {
    return await klaviyoClient.getCampaignRates(start, end);
  } catch (error) {
    console.error('Could not fetch campaign rates:', error);
    return null;
  }
}

/** e.g. "🟢 *1,234 more people* opened" / "🔴 *56 fewer people* clicked". */
function formatDifference(current: number, previous: number, action: string): string {
  const diff = current - previous;
  if (diff > 0) return `🟢 *${numberFormat.format(diff)} more people* ${action}`;
  if (diff < 0) return `🔴 *${numberFormat.format(-diff)} fewer people* ${action}`;
  return `⚪ Same number of people ${action}`;
}

/** Opens/clicks/conversions for a day: zero if nothing was sent, null if the rates report failed. */
function engagement(people: number, rates: CampaignRates | null) {
  if (people === 0) return { opens: 0, clicks: 0, conversions: 0 };
  return rates;
}

/**
 * /emails-sent [YYYY-MM-DD]
 * Compares how many people we emailed with campaigns on a day vs. the same weekday last year
 * (364 days earlier). Flow emails are not counted.
 * Defaults to today. For today, last year is cut off at the same time of day so the comparison is fair.
 */
export function createEmailsSentHandler(klaviyoClient: KlaviyoClient, timeZone: string) {
  return async ({ command, ack, respond }: SlackCommandMiddlewareArgs & AllMiddlewareArgs) => {
    await ack();

    const input = command.text.trim();
    const now = nowInTimezone(timeZone);
    const date = input ? parseIsoDate(input) : now.date;

    if (!date) {
      await respond({
        text: 'Please provide a valid date in YYYY-MM-DD format, or leave it empty for today.\n\nExample: `/emails-sent 2026-11-19`',
        response_type: 'ephemeral',
      });
      return;
    }

    if (date > now.date) {
      await respond({ text: `${date} is in the future.`, response_type: 'ephemeral' });
      return;
    }

    const lastYearDate = sameWeekdayLastYear(date);
    const isToday = date === now.date;
    // For today, only compare up to the current time of day; otherwise compare full days.
    const window = (d: string) => ({
      start: localToIso(d, '00:00:00', timeZone),
      end: isToday ? localToIso(d, now.time, timeZone) : localToIso(addDays(d, 1), '00:00:00', timeZone),
    });

    try {
      const thisYearWindow = window(date);
      const lastYearWindow = window(lastYearDate);
      const current = await klaviyoClient.getCampaignRecipients(thisYearWindow.start, thisYearWindow.end, timeZone);
      const previous = await klaviyoClient.getCampaignRecipients(lastYearWindow.start, lastYearWindow.end, timeZone);
      const currentRates = current > 0 ? await getRatesOrNull(klaviyoClient, thisYearWindow.start, thisYearWindow.end) : null;
      const previousRates = previous > 0 ? await getRatesOrNull(klaviyoClient, lastYearWindow.start, lastYearWindow.end) : null;

      const dayLines = (d: string, people: number, rates: CampaignRates | null) => {
        const lines = [`*${formatPrettyDate(d)}:* ${formatPeople(people)}`];
        const ratesLine = people > 0 ? formatRates(rates) : null;
        if (ratesLine) lines.push(ratesLine);
        return lines;
      };

      const lines = [
        `📧 *People emailed by campaigns: ${formatPrettyDate(date)} vs ${formatPrettyDate(lastYearDate)}*`,
        isToday ? `_Today so far (up to ${now.time.slice(0, 5)} ${timeZone}); last year is cut off at the same time._` : `_Full day, ${timeZone}._`,
        '',
        ...dayLines(date, current, currentRates),
        ...dayLines(lastYearDate, previous, previousRates),
      ];
      if (current === 0 && previous === 0) {
        lines.push('', 'No campaigns sent on either day.');
      } else {
        lines.push('', formatDifference(current, previous, 'emailed than last year'));
        const thisYear = engagement(current, currentRates);
        const lastYear = engagement(previous, previousRates);
        if (thisYear && lastYear) {
          lines.push(
            formatDifference(thisYear.opens, lastYear.opens, 'opened'),
            formatDifference(thisYear.clicks, lastYear.clicks, 'clicked'),
            formatDifference(thisYear.conversions, lastYear.conversions, 'converted')
          );
        }
      }
      if (isToday && current > 0) {
        lines.push('', '_Today\'s open, click and conversion rates are still coming in._');
      }

      await respond({ text: lines.join('\n'), response_type: 'in_channel' });
    } catch (error) {
      console.error('Error handling emails-sent command:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      await respond({
        text: `Unable to fetch email volume from Klaviyo.\n\nError: ${errorMessage}`,
        response_type: 'in_channel',
      });
    }
  };
}
