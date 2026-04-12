import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escHtml, gold, formatDate, debounce, uid } from '../lib/utils.js';

// ── escHtml ──────────────────────────────────────────────────────────────────

describe('escHtml', () => {
  it('returns empty string for null', () => expect(escHtml(null)).toBe(''));
  it('returns empty string for undefined', () => expect(escHtml(undefined)).toBe(''));

  it('escapes &', ()  => expect(escHtml('a&b')).toBe('a&amp;b'));
  it('escapes <', ()  => expect(escHtml('<div>')).toBe('&lt;div&gt;'));
  it('escapes >', ()  => expect(escHtml('a>b')).toBe('a&gt;b'));
  it('escapes "', ()  => expect(escHtml('"hello"')).toBe('&quot;hello&quot;'));
  it("escapes '", ()  => expect(escHtml("it's")).toBe("it&#x27;s"));

  it('escapes a full XSS payload', () => {
    const input    = `<script>alert('xss')</script>`;
    const expected = `&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;`;
    expect(escHtml(input)).toBe(expected);
  });

  it('does not double-escape safe strings', () => {
    expect(escHtml('Hello World')).toBe('Hello World');
  });

  it('converts numbers to string safely', () => {
    expect(escHtml(42)).toBe('42');
  });
});

// ── gold ─────────────────────────────────────────────────────────────────────

describe('gold', () => {
  it('returns "0" for 0', () => expect(gold(0)).toBe('0'));
  it('returns "0" for null', () => expect(gold(null)).toBe('0'));
  it('returns "0" for undefined', () => expect(gold(undefined)).toBe('0'));

  it('formats 1000 with French locale (space as thousands separator)', () => {
    // fr-FR uses non-breaking space (\u202f or \u00a0) as thousands separator
    const result = gold(1000);
    expect(result.replace(/\s/g, ' ')).toBe('1 000');
  });

  it('formats large numbers', () => {
    const result = gold(1250000);
    expect(result.replace(/\s/g, ' ')).toBe('1 250 000');
  });
});

// ── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns "—" for null', () => expect(formatDate(null)).toBe('—'));
  it('returns "—" for empty string', () => expect(formatDate('')).toBe('—'));

  it('formats a valid ISO date string', () => {
    // We only check it does not throw and returns a non-empty string
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });

  it('accepts custom options', () => {
    const result = formatDate('2024-06-01T00:00:00Z', { year: 'numeric' });
    expect(result).toBe('2024');
  });
});

// ── debounce ─────────────────────────────────────────────────────────────────

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delays the function call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets the timer on repeated calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments through', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a', 'b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('defaults to 250ms', () => {
    const fn = vi.fn();
    const debounced = debounce(fn);
    debounced();
    vi.advanceTimersByTime(249);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });
});

// ── uid ──────────────────────────────────────────────────────────────────────

describe('uid', () => {
  it('returns a non-empty string', () => {
    expect(typeof uid()).toBe('string');
    expect(uid().length).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, uid));
    expect(ids.size).toBe(100);
  });
});
