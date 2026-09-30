# State Inventory

## 1. Billing Screen States
- **Idle/Empty:** Master input is focused. Bill area shows watermarked icon. Total is ₹0.00.
- **Active:** Items present. Total > 0.
- **Quantity Edit Overlay:** A small input box hovers over the selected row's quantity. Focus is temporarily trapped here until `Enter` or `Esc`.
- **Search Dropdown Active:** User typed letters. Dropdown is visible.

## 2. Print Sub-States
- **Finalizing (Invisible):** DB save operation (<10ms).
- **Print Failed:** Banner appears at top. Screen is returned to Idle/Empty.

## 3. History Screen States
- **Loading:** Fetching from SQLite (should be <5ms, barely visible).
- **Populated:** List of bills.
- **Empty:** "No bills found."

## 4. Product Screen States
- **List View:** Browsing products.
- **Edit Mode:** Right panel fields are active.
- **Saving:** Brief disabled state during SQLite write.
