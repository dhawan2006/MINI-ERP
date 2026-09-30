# Printer Architecture

## Overview
The Mini Billing System implements a robust, asynchronous printing architecture tailored for ESC/POS thermal printers. 

Printing is strictly a **side effect** of the billing process. A finalized bill is fully persisted and immutable *before* any print attempt begins. Printer failures (e.g., paper out, connection refused) never compromise the integrity or state of a finalized bill.

## Architecture

The printer subsystem is composed of the following layers:

```text
                 Finalized Bill
                       │
                       ▼
                 ReceiptMapper
                       │
                       ▼
                  ReceiptData
                       │
                       ▼
             EscPosReceiptRenderer
                       │
                       ▼
                 ESC/POS Bytes
                       │
                       ▼
              IPrinterTransport
                  /          \
                 /            \
                ▼              ▼
             Network          USB
                │
                ▼
        Physical Thermal Printer
```

1. **ReceiptData**: The domain-agnostic data transfer object. It contains all data needed to format a receipt, but none of the business logic.
2. **EscPosReceiptRenderer**: A pure, deterministic component that converts `ReceiptData` and a `PrinterConfig` into a `Uint8Array` of raw ESC/POS command bytes.
3. **EscPosPrinterAdapter**: Composes the renderer and a configured transport, abstracting hardware operations from the application's `PrintService`.
4. **IPrinterTransport**: Defines the raw communication interface `write(data: Uint8Array): Promise<void>`.
5. **NetworkPrinterTransport**: Implements the transport over TCP/IP using Node.js' native `net` socket.

## Printer Configuration

The system uses a declarative `PrinterConfig` configuration:

```typescript
export interface PrinterConfig {
  enabled: boolean;
  transport: "network" | "usb" | "fake";
  host?: string;
  port?: number;
  deviceId?: string;
  paperWidth: 58 | 80;
  charactersPerLine: number; // The exact number of printable mono-spaced characters
  supportsCut: boolean;
  feedLines: number;
  encoding: string;
}
```

### Paper Widths (58mm vs 80mm)
The renderer does not hardcode column widths based on mm. Instead, it uses `charactersPerLine` to determine layout wrap bounds.
- A standard 58mm printer often supports 32 characters per line.
- A standard 80mm printer often supports 48 characters per line.
The renderer dynamically calculates item name wrap bounds to preserve right-aligned numerical columns (Qty and Amount).

## Supported Transports

### Network (TCP/IP)
**Status**: Implemented & Ready  
Network printing is the primary V1 transport mechanism. It uses native socket operations. It supports connection timeouts and cleanly categorizes `ECONNREFUSED` and `EHOSTUNREACH` into structured system errors.

### USB
**Status**: Architecture boundary stubbed  
USB is explicitly represented in the configuration and transport abstractions. However, its implementation remains an intentional stub (`PRINTER_UNSUPPORTED`). Native USB integration via standard Node modules (like `usb`) requires rigorous physical device testing to validate across target OS host platforms before production enablement.

### Fake
**Status**: Development & Testing  
The `FakePrinterAdapter` acts as a null-sink / simulator for end-to-end tests and development. Production binaries do not default to it when real hardware is intended.

## ESC/POS Features & Encoding

The `EscPosEncoder` isolates hexadecimal sequences:
- `Initialize` (0x1B 0x40)
- `Alignment` (Left, Center, Right)
- `Bold` (On/Off)
- `Feed Lines`
- `Cut` (Partial/Full)

### Encoding and Currency Fallbacks
By default, the renderer leverages a pure ASCII fallback encoding. If the Rupee symbol (`₹`) is present in the `ReceiptData`, the ASCII encoder deterministically replaces it with `Rs.` to prevent garbage binary sequences being sent to standard Western codepage (CP437, CP858) printers.

*Note on limitations*: The native Node `TextDecoder`/`TextEncoder` doesn't provide legacy CP858 encoding natively. If Indian Rupee symbols are strictly required natively on the thermal printer, a small utility library (e.g., `iconv-lite`) can be injected later into the `EscPosEncoding` interface, provided the physical printer's ROM has the matching character set flashed.

## Failure Behavior & Unknown Delivery

Raw TCP transport lacks application-level acknowledgement (ACK).
When a write completes successfully over the socket, the application marks the print job as `COMPLETED`. However, **uncertain delivery** is an inherent property of one-way raw printing (e.g., the printer's internal buffer fills, but it runs out of paper and power cycles before finishing). 

In all failure cases:
- The cashier UI receives an asynchronous notification.
- The next transaction is not blocked.
- The finalized bill remains safe in SQLite.
- The receipt can be reprinted via a retry command, which reliably renders identical bytes from the identical `ReceiptData`.
