# Search Architecture
- In-memory prefix trie or simple array .filter() loaded on startup.
- Why: 10,000 products take minimal RAM. Instant response <1ms without hitting SQLite for every keystroke.