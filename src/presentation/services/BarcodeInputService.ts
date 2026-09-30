/**
 * BarcodeInputService
 * 
 * Captures and identifies barcode scanner input from USB keyboard-wedge scanners.
 * Operates at the global window level during capture phase.
 * 
 * Detection strategy (priority order):
 *   1. Configured prefix/suffix (deterministic)
 *   2. Timing heuristic (fallback) — configurable threshold
 * 
 * Currency: INR. Barcode values are strings. Leading zeros preserved.
 * 
 * Output: normalized barcode string via onScan(barcode) callback.
 */

export interface BarcodeInputConfig {
  /** Optional prefix string sent by scanner (e.g. ']', 'F12') */
  prefix?: string;
  /** Suffix string indicating end of scan (default 'Enter') */
  suffix: string;
  /** Minimum characters to consider a valid scan (default 3) */
  minLength: number;
  /** Maximum average time per character in milliseconds (default 50). Configurable. */
  maxTimePerCharMs: number;
  /** Maximum buffer length before forced reset (default 50) */
  maxBufferLength: number;
}

type ScanCallback = (barcode: string) => void;

const DEFAULT_CONFIG: BarcodeInputConfig = {
  suffix: 'Enter',
  minLength: 3,
  maxTimePerCharMs: 100,
  maxBufferLength: 50
};

export class BarcodeInputService {
  private config: BarcodeInputConfig;
  private buffer: string = '';
  private firstCharTime: number = 0;
  private isScanning: boolean = false;
  private listeners: ScanCallback[] = [];
  
  // Singleton instance
  private static instance: BarcodeInputService;

  private constructor(config?: Partial<BarcodeInputConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  public static getInstance(config?: Partial<BarcodeInputConfig>): BarcodeInputService {
    if (!BarcodeInputService.instance) {
      BarcodeInputService.instance = new BarcodeInputService(config);
    }
    return BarcodeInputService.instance;
  }

  /** Reset singleton — for testing only */
  public static resetInstance(): void {
    if (BarcodeInputService.instance) {
      BarcodeInputService.instance.detach();
      BarcodeInputService.instance.listeners = [];
    }
    BarcodeInputService.instance = undefined as any;
  }

  public subscribe(callback: ScanCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  public attach() {
    // Must use capture: true to intercept before React synthetic events
    window.addEventListener('keydown', this.handleKeyDown, { capture: true });
  }

  public detach() {
    window.removeEventListener('keydown', this.handleKeyDown, { capture: true });
  }

  // Exposed for unit testing
  public __setConfigForTesting(config: Partial<BarcodeInputConfig>) {
    this.config = { ...this.config, ...config };
  }

  public __resetForTesting() {
    this.reset();
    this.listeners = [];
  }

  public handleKeyDown(e: KeyboardEvent) {
    // Ignore modifier keys alone
    if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta' || e.key === 'Alt') return;

    const now = Date.now();

    // ── Priority 1: Prefix Handling ──
    if (this.config.prefix && e.key === this.config.prefix) {
      this.isScanning = true;
      this.buffer = '';
      this.firstCharTime = now;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ── Active Prefix Mode (deterministic scan) ──
    if (this.isScanning) {
      if (e.key === this.config.suffix) {
        this.emitScan(this.buffer);
        this.reset();
      } else if (e.key.length === 1) {
        this.buffer += e.key;
        // Buffer overflow protection
        if (this.buffer.length > this.config.maxBufferLength) {
          this.reset();
          return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // ── Priority 4: Timing Heuristic Fallback ──
    
    // If existing buffer has grown too slow, reset it
    if (this.buffer.length > 0) {
      const timeSpan = now - this.firstCharTime;
      const averageTime = timeSpan / this.buffer.length;
      if (averageTime > this.config.maxTimePerCharMs) {
        this.reset();
      }
    }

    // Buffer overflow protection (timing mode)
    if (this.buffer.length >= this.config.maxBufferLength) {
      this.reset();
    }

    // Check if suffix arrived and buffer qualifies as a scan
    if (e.key === this.config.suffix && this.buffer.length >= this.config.minLength) {
      const avgTimePerChar = (now - this.firstCharTime) / this.buffer.length;
      
      if (avgTimePerChar <= this.config.maxTimePerCharMs) {
        const barcode = this.buffer;
        
        // Intercept suffix so it doesn't trigger UI actions (e.g. form submit)
        e.preventDefault();
        e.stopPropagation();
        
        // Clean up any leaked characters from the active input
        this.clearLeakedInput(barcode);
        
        this.emitScan(barcode);
        this.reset();
        return;
      }
    }

    // Buffer printable characters for timing analysis
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.buffer.length === 0) {
        this.firstCharTime = now;
      }
      this.buffer += e.key;
      // DO NOT preventDefault — this might be human typing
    } else if (e.key !== this.config.suffix) {
      // Non-printable, non-suffix key breaks the buffer sequence
      this.reset();
    }
  }

  private reset() {
    this.buffer = '';
    this.firstCharTime = 0;
    this.isScanning = false;
  }

  private emitScan(barcode: string) {
    // Normalize only known scanner artifacts
    const normalized = barcode.trim();
    if (!normalized) return;
    for (const listener of this.listeners) {
      listener(normalized);
    }
  }

  /**
   * When timing-based detection fires, barcode characters may have already
   * leaked into the focused input field. This strips them and commits
   * the clean value back to React's controlled state.
   */
  private clearLeakedInput(scannedBarcode: string) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      const input = active as HTMLInputElement;
      
      if (input.value.endsWith(scannedBarcode)) {
        // Use React's native value setter to update controlled inputs
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, input.value.slice(0, -scannedBarcode.length));
        } else {
          input.value = input.value.slice(0, -scannedBarcode.length);
        }
        
        // Fire input event to sync React state
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Blur to commit any pending edits (e.g. quantity editor)
      // and restore deterministic bill state before processing scan
      // But DO NOT blur the search input, so the cashier can keep scanning or typing
      if (input.dataset.context !== 'search-input') {
        input.dataset.scannerBlur = 'true';
        input.blur();
      }
    }
  }
}
