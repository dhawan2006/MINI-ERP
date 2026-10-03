import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuntimeCheckInCoordinator } from '../RuntimeCheckInCoordinator';
import { CryptoError } from '../../../src/shared/crypto/cryptoError';

describe('RuntimeCheckInCoordinator', () => {
  let coordinator: RuntimeCheckInCoordinator;
  let mockClient: any;
  let mockIdentity: any;
  let mockStore: any;
  let mockVerifier: any;

  beforeEach(() => {
    mockClient = {
      getRuntimeCheckInChallenge: vi.fn().mockResolvedValue({ challengeStr: 'abc' }),
      performRuntimeCheckIn: vi.fn().mockResolvedValue({ receipt: { signature: 'sig' } })
    };
    
    mockIdentity = {
      signChallenge: vi.fn().mockResolvedValue('signed-abc'),
      getPublicKey: vi.fn().mockResolvedValue('fake-public-key')
    };

    mockStore = {
      load: vi.fn().mockRejectedValue({ code: 'NOT_FOUND' }),
      save: vi.fn().mockResolvedValue(undefined)
    };

    mockVerifier = {
      verify: vi.fn().mockReturnValue({ serverTime: '2026-10-01T00:00:00Z', checkInValidUntil: '2026-10-08T00:00:00Z' })
    };

    coordinator = new RuntimeCheckInCoordinator(
      mockClient as any,
      mockIdentity as any,
      mockStore as any,
      mockVerifier as any
    );
  });

  it('performs a successful check-in', async () => {
    const result = await coordinator.triggerCheckIn('lic1', 'dev1');
    expect(result).toBe('SUCCESS');
    expect(mockClient.getRuntimeCheckInChallenge).toHaveBeenCalledWith('dev1', 'lic1');
    expect(mockClient.performRuntimeCheckIn).toHaveBeenCalled();
    expect(mockVerifier.verify).toHaveBeenCalled();
    expect(mockStore.save).toHaveBeenCalled();
  });

  it('enforces single-flight behavior (concurrent calls)', async () => {
    // Make performRuntimeCheckIn slow
    let resolveCheckIn: any;
    const promise = new Promise(r => resolveCheckIn = r);
    mockClient.performRuntimeCheckIn.mockReturnValue(promise);

    const call1 = coordinator.triggerCheckIn('lic1', 'dev1');
    const call2 = coordinator.triggerCheckIn('lic1', 'dev1');

    // Only one challenge request should have been made
    expect(mockClient.getRuntimeCheckInChallenge).toHaveBeenCalledTimes(1);

    resolveCheckIn({ receipt: { signature: 'sig' } });
    
    const [res1, res2] = await Promise.all([call1, call2]);
    expect(res1).toBe('SUCCESS');
    expect(res2).toBe('SUCCESS');
    expect(mockClient.performRuntimeCheckIn).toHaveBeenCalledTimes(1);
  });

  it('retries on network failure with backoff', async () => {
    // Fail twice, succeed third time
    mockClient.performRuntimeCheckIn
      .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
      .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
      .mockResolvedValueOnce({ receipt: { signature: 'sig' } });

    const result = await coordinator.triggerCheckIn('lic1', 'dev1');
    expect(result).toBe('SUCCESS');
    expect(mockClient.performRuntimeCheckIn).toHaveBeenCalledTimes(3);
  });

  it('returns NETWORK_FAILURE after max retries', async () => {
    mockClient.performRuntimeCheckIn.mockRejectedValue(new Error('NETWORK_ERROR'));
    
    const result = await coordinator.triggerCheckIn('lic1', 'dev1');
    expect(result).toBe('NETWORK_FAILURE');
    expect(mockClient.performRuntimeCheckIn).toHaveBeenCalledTimes(3);
  });

  it('returns HTTP_ERROR on 400 Bad Request immediately (no retry)', async () => {
    mockClient.performRuntimeCheckIn.mockRejectedValue(new Error('HTTP_400'));
    
    const result = await coordinator.triggerCheckIn('lic1', 'dev1');
    expect(result).toBe('HTTP_ERROR');
    expect(mockClient.performRuntimeCheckIn).toHaveBeenCalledTimes(1);
  });

  it('returns CRYPTO_ERROR immediately if verifier throws CryptoError', async () => {
    mockVerifier.verify.mockImplementation(() => {
      throw new CryptoError('INVALID_SIGNATURE', 'test');
    });

    const result = await coordinator.triggerCheckIn('lic1', 'dev1');
    expect(result).toBe('CRYPTO_ERROR');
    expect(mockClient.performRuntimeCheckIn).toHaveBeenCalledTimes(1);
    expect(mockStore.save).not.toHaveBeenCalled();
  });

  it('prevents older receipt from replacing newer receipt (anti-rollback)', async () => {
    // Stored receipt is from 10-02
    mockStore.load.mockResolvedValue({
      receipt: { serverTime: '2026-10-02T00:00:00Z' }
    });

    // Incoming receipt is from 10-01 (older)
    mockVerifier.verify.mockReturnValue({
      serverTime: '2026-10-01T00:00:00Z',
      checkInValidUntil: '2026-10-08T00:00:00Z'
    });

    const result = await coordinator.triggerCheckIn('lic1', 'dev1');
    expect(result).toBe('HTTP_ERROR'); // Custom hard failure
    expect(mockStore.save).not.toHaveBeenCalled();
  });
});
