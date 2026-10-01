import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from 'electron';
import { FakeDeviceIdentityProvider } from '../../electron/native/FakeDeviceIdentityProvider';

// We rely on vitest mocking the 'electron' module which is done globally or we can do it here.
vi.mock('electron', () => {
  return {
    app: {
      isPackaged: false
    }
  };
});

describe('FakeDeviceIdentityProvider Isolation', () => {
  afterEach(() => {
    app.isPackaged = false;
  });

  it('should instantiate normally when app.isPackaged is false', () => {
    app.isPackaged = false;
    expect(() => new FakeDeviceIdentityProvider()).not.toThrow();
  });

  it('should throw SEC-FATAL when app.isPackaged is true', () => {
    app.isPackaged = true;
    expect(() => new FakeDeviceIdentityProvider()).toThrow('SEC-FATAL: FakeDeviceIdentityProvider cannot be used in production builds.');
  });
});
