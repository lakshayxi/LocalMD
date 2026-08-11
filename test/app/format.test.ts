import { describe, expect, it } from 'vitest';
import { fileSize, relativeTime } from '@/app/format';

const NOW = Date.parse('2026-08-11T12:00:00Z');
const ago = (ms: number) => relativeTime(NOW - ms, NOW);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('collapses the last minute to "just now"', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59 * SECOND)).toBe('just now');
  });

  it('counts in the largest unit that fits', () => {
    expect(ago(5 * MINUTE)).toBe('5 minutes ago');
    expect(ago(3 * HOUR)).toBe('3 hours ago');
    expect(ago(3 * DAY)).toBe('3 days ago');
    expect(ago(20 * DAY)).toBe('2 weeks ago');
  });

  it('uses the words a reader would', () => {
    // `numeric: 'auto'` is what turns "1 day ago" into "yesterday". Worth
    // asserting: it is the difference between a list that reads and a log.
    expect(ago(DAY)).toBe('yesterday');
    expect(ago(7 * DAY)).toBe('last week');
  });

  it('rounds down at every boundary, never forward into the future', () => {
    expect(ago(HOUR - SECOND)).toBe('59 minutes ago');
    expect(ago(DAY - SECOND)).toBe('23 hours ago');
  });
});

describe('fileSize', () => {
  it('says nothing when the size was never read', () => {
    expect(fileSize(null)).toBeNull();
  });

  it('scales the unit to the number', () => {
    expect(fileSize(0)).toBe('0 B');
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(1024 * 1024)).toBe('1.0 MB');
    expect(fileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
