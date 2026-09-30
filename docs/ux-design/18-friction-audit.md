# Friction Audit

| Feature | Friction Identified | Proposed Solution | Action |
| --- | --- | --- | --- |
| Delete Item | A popup asking "Are you sure?" slows down recovery by 3 seconds. | Remove popup. `Delete` is instant. | **Eliminated** |
| Quantity | Prompting for quantity on every scan wastes time for 90% of items. | Default to Qty 1. Provide `F4` shortcut for bulk items. | **Simplified** |
| Search | Clicking the search bar requires the mouse. | Auto-focus it. Provide `F1` shortcut as fallback. | **Simplified** |
| Print Success | Showing a "Transaction Complete" modal requires an `Enter` press to clear. | Screen clears instantly. Next scan is immediately ready. | **Eliminated** |
