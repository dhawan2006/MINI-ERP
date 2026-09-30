export interface EscPosEncoding {
  encode(text: string): Uint8Array;
}

export class AsciiEncoding implements EscPosEncoding {
  encode(text: string): Uint8Array {
    // Basic ASCII encoding. Replaces unsupported chars with '?'
    // For ₹, we should technically handle it before this level, 
    // but we can do a naive replace here if the string still has it.
    const safeText = text.replace(/₹/g, 'Rs.');
    const buf = new Uint8Array(safeText.length);
    for (let i = 0; i < safeText.length; i++) {
      const code = safeText.charCodeAt(i);
      buf[i] = code > 255 ? 63 : code; // 63 is '?'
    }
    return buf;
  }
}

export class EscPosEncoder {
  private buffer: number[] = [];

  constructor(private encoding: EscPosEncoding = new AsciiEncoding()) {}

  private write(bytes: number[]) {
    this.buffer.push(...bytes);
  }

  initialize(): this {
    this.write([0x1b, 0x40]);
    return this;
  }

  alignLeft(): this {
    this.write([0x1b, 0x61, 0x00]);
    return this;
  }

  alignCenter(): this {
    this.write([0x1b, 0x61, 0x01]);
    return this;
  }

  alignRight(): this {
    this.write([0x1b, 0x61, 0x02]);
    return this;
  }

  bold(enabled: boolean): this {
    this.write([0x1b, 0x45, enabled ? 1 : 0]);
    return this;
  }

  text(content: string): this {
    const encoded = this.encoding.encode(content);
    for (let i = 0; i < encoded.length; i++) {
      this.buffer.push(encoded[i]);
    }
    return this;
  }

  line(content: string = ''): this {
    this.text(content);
    this.write([0x0a]);
    return this;
  }

  feed(lines: number): this {
    this.write([0x1b, 0x64, lines]);
    return this;
  }

  cut(fullCut: boolean = false): this {
    // 0x1D 0x56 0x00 (Full cut) or 0x01 (Partial cut)
    this.write([0x1d, 0x56, fullCut ? 0x00 : 0x01]);
    return this;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
