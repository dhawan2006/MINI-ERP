# Information Architecture

## Application Structure
The application has a radically flattened hierarchy. The **Billing Screen** is the default, primary, and dominant state.

### Primary Navigation (Keyboard-driven)
- **Billing (Default)**: The core checkout view.
- **History (`F2`)**: View past receipts.
- **Products (`F3`)**: Add/edit product catalogue.
- **Settings (`F9`)**: App configuration.

### Screen Hierarchy Rules
- **Never Interrupt Billing:** If the user is actively building a bill (items > 0), navigating away is blocked or strongly discouraged visually, but practically, the cashier has no reason to navigate away.
- **Flat Layout:** There are no nested menus. Everything is one level deep.
