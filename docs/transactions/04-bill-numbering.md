# 04. Bill Numbering

The application guarantees monotonic, sequential bill numbering.

## Strategy
- Bill numbers are generated sequentially (e.g., 1, 2, 3).
- The highest existing bill number is fetched from the database on startup.
- Bill numbers are independent of SQLite `rowid` or UUID primary keys.

## Uniqueness & Concurrency
- Bill numbers are allocated right before database insertion.
- The atomic transaction ensures that if the insert fails, the application does not permanently skip or lose the bill number (it can be regenerated for the next attempt).
- V1 does not support multi-device or daily resets. The numbering is globally monotonic for the local database.
