# UX Acceptance Criteria

Before Stage 3 is considered successful, the implementation must pass:
1. **No-Mouse Checkout:** A 10-item bill with 1 deletion and 1 quantity change can be completed without moving the mouse pointer.
2. **Continuous Scanning:** The scanner can fire 5 times in 1 second, and the app will register 5 separate line items without dropping inputs.
3. **Focus Lock:** Clicking the blank white background of the app immediately restores focus to the master input.
4. **Audio Verification:** Scanning an unknown barcode immediately produces the harsh Buzz sound.
5. **Print Recovery:** Unplugging the printer and hitting `F12` readies the UI for the next bill but shows the red retry banner.
