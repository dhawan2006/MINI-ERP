# Visual Design System

## Philosophy
Clarity > Decoration. Speed > Animation.

## Typography
- **Font:** Inter, Roboto, or system sans-serif.
- **Hierarchy:**
  - `Grand Total`: 48px, Bold.
  - `Master Input`: 32px, Regular.
  - `Line Item Name`: 18px, Medium.
  - `Line Item Price/Qty`: 16px, Regular.

## Color Roles
- **Background (`--bg-color`):** `#f8fafc` (Slate 50) - Reduces eye strain compared to pure white.
- **Surface (`--surface`):** `#ffffff` (White) - For the Bill list area.
- **Primary Text (`--text-main`):** `#0f172a` (Slate 900) - Maximum contrast.
- **Secondary Text (`--text-muted`):** `#64748b` (Slate 500) - For timestamps or IDs.
- **Success (`--color-success`):** `#16a34a` (Green 600) - Used sparingly.
- **Error (`--color-error`):** `#dc2626` (Red 600) - For toasts and failed prints.
- **Focus Ring (`--color-focus`):** `#2563eb` (Blue 600), 3px solid. Essential for keyboard navigation visibility.

## Spacing & Density
- High density. Padding is minimal (8px - 16px) to allow maximum items on screen without scrolling.

## Animations
- None. Transitions (e.g., hover states) are clamped to 50ms. Lists do not smoothly slide in; they appear instantly.
