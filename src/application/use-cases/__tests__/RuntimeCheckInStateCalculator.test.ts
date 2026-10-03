import { describe, it, expect } from 'vitest';
import { RuntimeCheckInStateCalculator } from '../RuntimeCheckInStateCalculator';

describe('RuntimeCheckInStateCalculator', () => {
  it('returns NOT_APPLICABLE if not policy V1', () => {
    expect(RuntimeCheckInStateCalculator.calculateStatus(false, undefined, Date.now())).toBe('NOT_APPLICABLE');
  });

  it('returns EXPIRED if policy V1 but no validUntil provided', () => {
    expect(RuntimeCheckInStateCalculator.calculateStatus(true, undefined, Date.now())).toBe('EXPIRED');
  });

  it('returns CURRENT if > 48h remain', () => {
    const now = Date.now();
    const validUntil = new Date(now + 72 * 3600 * 1000).toISOString();
    expect(RuntimeCheckInStateCalculator.calculateStatus(true, validUntil, now)).toBe('CURRENT');
  });

  it('returns DUE_SOON if exactly 48h remain', () => {
    const now = Date.now();
    const validUntil = new Date(now + 48 * 3600 * 1000).toISOString();
    expect(RuntimeCheckInStateCalculator.calculateStatus(true, validUntil, now)).toBe('DUE_SOON');
  });

  it('returns DUE_SOON if 24h remain', () => {
    const now = Date.now();
    const validUntil = new Date(now + 24 * 3600 * 1000).toISOString();
    expect(RuntimeCheckInStateCalculator.calculateStatus(true, validUntil, now)).toBe('DUE_SOON');
  });

  it('returns REQUIRED if exactly 6h remain', () => {
    const now = Date.now();
    const validUntil = new Date(now + 6 * 3600 * 1000).toISOString();
    expect(RuntimeCheckInStateCalculator.calculateStatus(true, validUntil, now)).toBe('REQUIRED');
  });

  it('returns REQUIRED if 1h remain', () => {
    const now = Date.now();
    const validUntil = new Date(now + 1 * 3600 * 1000).toISOString();
    expect(RuntimeCheckInStateCalculator.calculateStatus(true, validUntil, now)).toBe('REQUIRED');
  });

  it('returns EXPIRED if expired', () => {
    const now = Date.now();
    const validUntil = new Date(now - 1 * 3600 * 1000).toISOString();
    expect(RuntimeCheckInStateCalculator.calculateStatus(true, validUntil, now)).toBe('EXPIRED');
  });

  it('returns EXPIRED if invalid timestamp format', () => {
    expect(RuntimeCheckInStateCalculator.calculateStatus(true, 'invalid-date', Date.now())).toBe('EXPIRED');
  });
});
