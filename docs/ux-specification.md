# UX Specification

## Status
CONFIRMED (Stage 1)

## Input & Focus
- **Aggressive Auto-Focus:** The UI contains a master input field. If the user clicks the background, the app refocuses the field within 10ms. Mouse interaction is fundamentally deprecated for the checkout flow.
- **Dual-Purpose Input:** The master input acts as the target for barcode scanners and the manual search input for the keyboard.

## Search
- **Prefix Matching:** Prioritized over fuzzy search for predictability and muscle memory. 
- **Instant Display:** Results appear instantly below the input, navigable via Up/Down arrows.

## Visual Hierarchy
1. Master Input (Search/Scan)
2. Current Bill (Chronological list of items)
3. Grand Total
4. Mistake Recovery & State Banners (Print Failures, etc.)

## Feedback
- **Audio:** High-pitch "Ding" on valid add. Loud, harsh "Buzz" on unrecognized barcode or empty finalization attempt.
- **Visual:** Instant appearance of the new line item. No blocking modals.

## Mistake Recovery
- **Line Deletion:** Instant and permanent. No confirmation.
- **Void Bill:** Requires soft-confirmation (double-tap).
