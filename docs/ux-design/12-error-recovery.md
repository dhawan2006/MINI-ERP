# Error Recovery & Feedback System

## Feedback Hierarchy
Feedback must never interfere with rapid scanning.

### 1. Success Feedback (Implicit)
- **Visual:** Scanned item drops into the list instantly. Total increments.
- **Audio:** High-pitch "Ding".
- **Interruption:** Zero.

### 2. Informational Feedback
- **Visual:** Small grey toast at the top center. E.g., "Draft bill restored."
- **Audio:** None.
- **Interruption:** Zero. Auto-dismisses in 3s.

### 3. Warning Feedback
- **Visual:** Yellow toast. E.g., "Press Esc again to void bill."
- **Audio:** None.
- **Interruption:** Zero.

### 4. Error Feedback (Recoverable)
- **Visual:** Red toast banner. E.g., "Unknown Barcode: 123456" or "Print Failed. Press F8."
- **Audio:** Loud, harsh "Buzz".
- **Interruption:** Minor. Does not steal focus. Does not block the screen. Cashier can immediately scan the next correct item.

### 5. Critical Failure
- **Visual:** Full-screen modal or unhandled exception screen. E.g., "Database corruption detected."
- **Interruption:** Complete. Requires app restart or technical intervention.
