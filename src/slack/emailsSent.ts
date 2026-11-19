import { SlackCommandMiddlewareArgs, AllMiddlewareArgs } from '@slack/bolt';
import { KlaviyoClient } from '../klaviyo/client';
import { EmailVolume } from '../klaviyo/types';
import {
  addDays,
  formatPrettyDate,
  localToIso,
  nowInTimezone,
  parseIsoDate,
  sameWeekdayLastYear,
} from '../utils/dates';

const numberFormat = new Intl.NumberFormat('en-US');

function formatChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '(no change)' : '(n/a, none last year)';
  const pct = ((current - previous) / previous) * 100;
  const arrow = pct > 0 ? '🔺' : pct < 0 ? '🔻' : '➖';
  const sign = pct > 0 ? '+' : '';
  return `${arrow} ${sign}${pct.toFixed(1)}%`;
}

function formatLine(label: string, current: number, previous: number): string {
  return `*${label}:* ${numberFormat.format(current)} vs ${numberFormat.format(previous)}  ${formatChange(current, previous)}`;
}

/**
 * /emails-sent [YYYY-MM-DD]
 * Compares how many people we emailed on a day vs. the same weekday last year (364 days earlier).
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
      const current: EmailVolume = await klaviyoClient.getEmailVolume(thisYearWindow.start, thisYearWindow.end, timeZone);
      const previous: EmailVolume = await klaviyoClient.getEmailVolume(lastYearWindow.start, lastYearWindow.end, timeZone);

      const lines = [
        `📧 *Emails sent: ${formatPrettyDate(date)} vs ${formatPrettyDate(lastYearDate)}*`,
        isToday ? `_Today so far (up to ${now.time.slice(0, 5)} ${timeZone}); last year is cut off at the same time._` : `_Full day, ${timeZone}._`,
        '',
        formatLine('People emailed', current.uniqueRecipients, previous.uniqueRecipients),
        formatLine('Emails sent', current.emailsSent, previous.emailsSent),
        '',
        '_Includes campaigns and flows (Klaviyo "Received Email" metric)._',
      ];

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
