# 01. Bill Lifecycle

The lifecycle of a bill in the Mini Billing System consists of two primary phases: Active Draft and Finalized Bill.

## 1. Active Draft
When a cashier starts adding products, an Active Draft is created. This draft is fully mutable.
- Products can be added, modified, or removed.
- Quantities can be adjusted.
- Pricing is dynamic and fetched from the current product catalog.
- State is continuously persisted as a serialized JSON snapshot in the `drafts` table to recover from application crashes.

## 2. Finalized Bill
When the cashier clicks "Finalize Bill", the active draft undergoes validation and is converted into a Finalized Bill.
- It is immutable. Prices, quantities, and product names are permanently snapshot.
- A sequential, monotonic Bill Number is assigned.
- It is persisted across the `bills` and `bill_items` tables using an atomic SQLite transaction.
- The corresponding draft is deleted.
- Printing is an asynchronous side-effect and does not affect the finalized state.
