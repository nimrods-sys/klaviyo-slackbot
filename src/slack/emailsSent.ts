import { SlackCommandMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { KlaviyoClient } from '../klaviyo/client';
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

function formatDifference(current: number, previous: number): string {
  const diff = current - previous;
  if (diff > 0) return `🟢 *${numberFormat.format(diff)} more people* emailed than last year`;
  if (diff < 0) return `🔴 *${numberFormat.format(-diff)} fewer people* emailed than last year`;
  return '⚪ Same number of people as last year';
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

      const lines = [
        `📧 *People emailed by campaigns: ${formatPrettyDate(date)} vs ${formatPrettyDate(lastYearDate)}*`,
        isToday ? `_Today so far (up to ${now.time.slice(0, 5)} ${timeZone}); last year is cut off at the same time._` : `_Full day, ${timeZone}._`,
        '',
        `${formatPrettyDate(date)}: *${formatPeople(current)}*`,
        `${formatPrettyDate(lastYearDate)}: *${formatPeople(previous)}*`,
      ];
      if (current === 0 && previous === 0) {
        lines.push('', 'No campaigns sent on either day.');
      } else {
        lines.push('', formatDifference(current, previous));
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
