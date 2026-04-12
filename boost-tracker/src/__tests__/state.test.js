import { describe, it, expect, beforeEach } from 'vitest';
import { getState, setState, subscribe, getRole, isAdmin, isMember, getUser } from '../lib/state.js';

// Reset state between tests
beforeEach(() => {
  setState('currentUser', null);
  setState('currentRole', null);
  setState('membres', []);
  setState('teams', []);
});

// ── getState / setState ───────────────────────────────────────────────────────

describe('getState / setState', () => {
  it('returns null by default for currentUser', () => {
    expect(getState('currentUser')).toBeNull();
  });

  it('stores and retrieves a value', () => {
    setState('currentUser', { id: 'abc' });
    expect(getState('currentUser')).toEqual({ id: 'abc' });
  });

  it('overwrites previous value', () => {
    setState('currentRole', 'admin');
    setState('currentRole', 'member');
    expect(getState('currentRole')).toBe('member');
  });
});

// ── subscribe ─────────────────────────────────────────────────────────────────

describe('subscribe', () => {
  it('calls the listener when state changes', () => {
    let called = false;
    subscribe('currentRole', v => { called = v; });
    setState('currentRole', 'admin');
    expect(called).toBe('admin');
  });

  it('unsubscribes correctly', () => {
    let count = 0;
    const unsub = subscribe('currentRole', () => count++);
    setState('currentRole', 'admin');
    unsub();
    setState('currentRole', 'member');
    expect(count).toBe(1);
  });

  it('supports multiple listeners on the same key', () => {
    const calls = [];
    subscribe('currentRole', v => calls.push('a:' + v));
    subscribe('currentRole', v => calls.push('b:' + v));
    setState('currentRole', 'viewer');
    expect(calls).toEqual(['a:viewer', 'b:viewer']);
  });
});

// ── role helpers ──────────────────────────────────────────────────────────────

describe('isAdmin', () => {
  it('returns true when role is admin', () => {
    setState('currentRole', 'admin');
    expect(isAdmin()).toBe(true);
  });
  it('returns false when role is member', () => {
    setState('currentRole', 'member');
    expect(isAdmin()).toBe(false);
  });
  it('returns false when role is null', () => {
    setState('currentRole', null);
    expect(isAdmin()).toBe(false);
  });
});

describe('isMember', () => {
  it('returns true for admin', () => {
    setState('currentRole', 'admin');
    expect(isMember()).toBe(true);
  });
  it('returns true for member', () => {
    setState('currentRole', 'member');
    expect(isMember()).toBe(true);
  });
  it('returns false for viewer', () => {
    setState('currentRole', 'viewer');
    expect(isMember()).toBe(false);
  });
  it('returns false when no role', () => {
    setState('currentRole', null);
    expect(isMember()).toBe(false);
  });
});

describe('getRole / getUser', () => {
  it('getRole returns the current role', () => {
    setState('currentRole', 'admin');
    expect(getRole()).toBe('admin');
  });
  it('getUser returns the current user', () => {
    const user = { id: 'u1', email: 'test@test.com' };
    setState('currentUser', user);
    expect(getUser()).toEqual(user);
  });
});
