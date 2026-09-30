/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BarcodeInputService } from '../../../src/presentation/services/BarcodeInputService';

describe('BarcodeInputService', () => {
  let service: BarcodeInputService;
  let scanCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = BarcodeInputService.getInstance();
    service.__resetForTesting();
    service.__setConfigForTesting({ prefix: undefined, suffix: 'Enter', maxTimePerCharMs: 30, minLength: 3 });
    scanCallback = vi.fn();
    service.subscribe(scanCallback);
  });

  afterEach(() => {
    service.__resetForTesting();
    vi.restoreAllMocks();
  });

  const simulateKeydown = (key: string, ctrlKey = false) => {
    const event = new KeyboardEvent('keydown', { key, ctrlKey, cancelable: true });
    // JSDOM doesn't easily let us test stopPropagation effects on other listeners,
    // but we can test if the service calls them.
    vi.spyOn(event, 'preventDefault');
    vi.spyOn(event, 'stopPropagation');
    service.handleKeyDown(event);
    return event;
  };

  it('detects a fast barcode scan based on timing fallback', () => {
    // Simulate fast typing
    vi.useFakeTimers();
    simulateKeydown('1');
    vi.advanceTimersByTime(10);
    simulateKeydown('2');
    vi.advanceTimersByTime(10);
    simulateKeydown('3');
    vi.advanceTimersByTime(10);
    
    const enterEvent = simulateKeydown('Enter');
    
    expect(scanCallback).toHaveBeenCalledWith('123');
    expect(enterEvent.preventDefault).toHaveBeenCalled();
    expect(enterEvent.stopPropagation).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('ignores slow human typing', () => {
    vi.useFakeTimers();
    simulateKeydown('1');
    vi.advanceTimersByTime(100);
    simulateKeydown('2');
    vi.advanceTimersByTime(100);
    simulateKeydown('3');
    vi.advanceTimersByTime(100);
    
    const enterEvent = simulateKeydown('Enter');
    
    // Time per char is 100ms, which > 30ms limit
    expect(scanCallback).not.toHaveBeenCalled();
    expect(enterEvent.preventDefault).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('detects barcode when prefix is configured, regardless of speed', () => {
    service.__setConfigForTesting({ prefix: ']' });
    
    vi.useFakeTimers();
    
    const prefixEvent = simulateKeydown(']');
    expect(prefixEvent.preventDefault).toHaveBeenCalled();

    vi.advanceTimersByTime(500); // Very slow!
    simulateKeydown('A');
    vi.advanceTimersByTime(500);
    simulateKeydown('B');
    vi.advanceTimersByTime(500);
    simulateKeydown('C');
    vi.advanceTimersByTime(500);
    
    const enterEvent = simulateKeydown('Enter');
    
    expect(scanCallback).toHaveBeenCalledWith('ABC');
    expect(enterEvent.preventDefault).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('clears leaked input from focused elements', () => {
    vi.useFakeTimers();
    
    // Create a mock input
    const input = document.createElement('input');
    input.value = '123';
    document.body.appendChild(input);
    input.focus();
    
    // Simulate fast typing of '123'
    simulateKeydown('1');
    vi.advanceTimersByTime(5);
    simulateKeydown('2');
    vi.advanceTimersByTime(5);
    simulateKeydown('3');
    vi.advanceTimersByTime(5);
    
    // The Enter key triggers the cleanup
    simulateKeydown('Enter');
    
    // The active input should have the barcode characters stripped
    expect(input.value).toBe('');
    
    // It should also be blurred
    expect(document.activeElement).not.toBe(input);
    
    document.body.removeChild(input);
    vi.useRealTimers();
  });
});
