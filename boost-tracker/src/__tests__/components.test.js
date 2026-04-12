import { describe, it, expect } from 'vitest';
import { roleImg, speColor, renderLadderRows } from '../ui/components.js';

// ── roleImg ───────────────────────────────────────────────────────────────────

describe('roleImg', () => {
  it('renders a shield for TANK', () => {
    expect(roleImg('TANK', 20)).toContain('🛡');
    expect(roleImg('TANK', 20)).toContain('title="Tank"');
  });

  it('renders a leaf for Heal', () => {
    expect(roleImg('Heal', 20)).toContain('🍃');
    expect(roleImg('Heal', 20)).toContain('title="Heal"');
  });

  it('renders swords for DPS', () => {
    expect(roleImg('DPS', 20)).toContain('⚔️');
    expect(roleImg('DPS', 20)).toContain('title="DPS"');
  });

  it('treats DPS.C and DPS.D as DPS', () => {
    expect(roleImg('DPS.C', 20)).toContain('title="DPS"');
    expect(roleImg('DPS.D', 20)).toContain('title="DPS"');
  });

  it('defaults to DPS for unknown roles', () => {
    expect(roleImg('Unknown', 20)).toContain('title="DPS"');
    expect(roleImg(null, 20)).toContain('title="DPS"');
  });

  it('applies the requested size', () => {
    const html = roleImg('TANK', 30);
    expect(html).toContain('width:30px');
    expect(html).toContain('height:30px');
  });
});

// ── speColor ──────────────────────────────────────────────────────────────────

describe('speColor', () => {
  it('returns fallback for empty string', () => {
    expect(speColor('')).toBe('#555');
  });
  it('returns fallback for null', () => {
    expect(speColor(null)).toBe('#555');
  });
  it('returns a non-fallback color for Paladin', () => {
    const c = speColor('Paladin Protection');
    expect(c).not.toBe('#555');
    expect(c).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });
  it('returns a non-fallback color for Guerrier', () => {
    const c = speColor('Guerrier Bras');
    expect(c).not.toBe('#555');
  });
});

// ── renderLadderRows ──────────────────────────────────────────────────────────

describe('renderLadderRows', () => {
  it('renders the empty state when no entries', () => {
    const html = renderLadderRows([], 'Aucun run');
    expect(html).toContain('Aucun run');
    expect(html).toContain('empty');
  });

  it('wraps rows in .ladder-list', () => {
    const rows = [
      ['id1', { nom: 'Alice', spe: 'Heal', classe: 'Prêtre Sacré', earned: 50000, runs: 3 }],
      ['id2', { nom: 'Bob',   spe: 'TANK', classe: 'Paladin',       earned: 30000, runs: 2 }],
    ];
    const html = renderLadderRows(rows, '');
    expect(html).toContain('ladder-list');
    expect(html).toContain('ladder-row');
  });

  it('escapes HTML in player names', () => {
    const rows = [
      ['id1', { nom: '<script>bad</script>', spe: 'DPS', classe: '', earned: 1000, runs: 1 }],
    ];
    const html = renderLadderRows(rows, '');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applies top1/top2/top3 classes to the first three rows', () => {
    const rows = Array.from({ length: 4 }, (_, i) => [
      'id' + i,
      { nom: 'P' + i, spe: 'DPS', classe: '', earned: 100 - i * 10, runs: 1 },
    ]);
    const html = renderLadderRows(rows, '');
    expect(html).toContain('top1');
    expect(html).toContain('top2');
    expect(html).toContain('top3');
    // 4th row should not have top class
    const fourthIdx = html.indexOf('ladder-row', html.indexOf('top3') + 1);
    const snippet = html.slice(fourthIdx, fourthIdx + 50);
    expect(snippet).not.toContain('top1');
    expect(snippet).not.toContain('top2');
    expect(snippet).not.toContain('top3');
  });

  it('shows run count correctly', () => {
    const rows = [['id1', { nom: 'A', spe: 'DPS', classe: '', earned: 5000, runs: 7 }]];
    const html = renderLadderRows(rows, '');
    expect(html).toContain('7 runs');
  });

  it('handles singular run', () => {
    const rows = [['id1', { nom: 'A', spe: 'DPS', classe: '', earned: 1000, runs: 1 }]];
    const html = renderLadderRows(rows, '');
    expect(html).toContain('1 run');
    expect(html).not.toContain('1 runs');
  });
});
