import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  LookupConnectionError,
  classifyTransportError,
  connectionFromError,
  connectivityMessage,
  preemptLookup,
} from '../../utils/connectivityError';
import { setConnectivityStatus } from '../../services/networkSignals';

describe('connectivityError', () => {
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    setConnectivityStatus('online');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    setConnectivityStatus('online');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine });
  });

  it('treats a device with no network as offline even when the error looks like a timeout', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    expect(classifyTransportError({ code: 'ECONNABORTED', message: 'timeout of 8000ms exceeded' })).toBe(
      'device-offline'
    );
  });

  it('treats a slow request that never finishes as a timeout when the device is online', () => {
    const kind = classifyTransportError({ code: 'ECONNABORTED', message: 'timeout of 8000ms exceeded' });
    expect(kind).toBe('request-timeout');
    expect(connectivityMessage(kind!)).toMatch(/timed out/i);
    expect(connectivityMessage(kind!)).not.toMatch(/no results/i);
  });

  it('treats a missing HTTP response as the server being unreachable', () => {
    expect(classifyTransportError({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe('server-unreachable');
  });

  it('does not treat an HTTP answer, including 404, as a connection failure', () => {
    expect(classifyTransportError({ response: { status: 404 }, message: 'Not Found' })).toBeNull();
    expect(classifyTransportError({ response: { status: 500 }, message: 'Server error' })).toBeNull();
  });

  it('skips a new lookup immediately when the API is already unreachable', () => {
    setConnectivityStatus('api-unreachable');
    const blocked = preemptLookup();
    expect(blocked?.warningType).toBe('connection');
    expect(blocked?.message).toMatch(/Can't reach the server/);
  });

  it('maps a thrown lookup error back to the same connection warning', () => {
    const error = new LookupConnectionError('request-timeout');
    expect(connectionFromError(error)?.message).toMatch(/took too long/);
  });
});
