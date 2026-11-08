# Mini POS — Database Backup Retention & Recovery Policy

**Document Version:** 1.0.0  
**Effective Date:** November 8, 2026  
**Scope:** Hosted Supabase PostgreSQL Database & Administrator Services  
**Author:** DevOps & Database Reliability Engineering  

---

## 1. Overview & Objectives

Following the complete architectural removal of the licensing subsystem, the hosted PostgreSQL database exclusively serves tenant management (`customers`), administrative role-based access control (`admin_roles`), audit event logging (`audit_events`), and idempotency tracking (`admin_idempotency_keys`).

The objective of this policy is to guarantee:
- Point-in-time durability and disaster recovery capability.
- Cryptographic protection of stored database backups at rest.
- Structured retention rules to balance business continuity with data protection regulations.
- A repeatable, independently verified restoration procedure that never impacts live production.

---

## 2. Backup Strategy & Architecture

| Parameter | Specification | Details |
| :--- | :--- | :--- |
| **Backup Engine** | PostgreSQL Native `pg_dump` | Format: Plain SQL with ANSI COPY statements (`--use-copy`). |
| **Artifact Types** | DDL (`schema.sql`) + DML (`data.sql`) | Clean separation of schema definitions from table data. |
| **Consistency Mode** | Transactional Snapshot | Executed within a single repeatable-read transaction (`BEGIN ISOLATION LEVEL REPEATABLE READ`). |
| **Target Infrastructure** | Hosted Supabase PostgreSQL | Target Ref: `hooemticmycoqhoccdsn` (`ap-southeast-1`). |
| **Durable Storage** | Secure Host Vault | Primary: `/Users/laksh/.minipos_secure_backups/hosted_supabase/<TIMESTAMP>/` |
| **Permissions** | Restrictive POSIX Mode | Directory: `0700` (`rwx------`). Files: `0600` (`rw-------`). |

---

## 3. Cryptographic Protection at Rest

All durable backups must be encrypted prior to long-term storage or off-site transfer:

- **Algorithm:** AES-256-CBC with PBKDF2 key derivation.
- **Iteration Count:** 100,000 iterations.
- **Key Generation:** Cryptographically random 256-bit hexadecimal key generated via `openssl rand -hex 32`.
- **Key Storage:** Stored separately in `backup_encryption_key.secret` with POSIX permissions `0600`, never committed to version control.
- **Packaging:** Encrypted archive format `minipos_backup_<TIMESTAMP>.tar.gz.enc`.

### Verification Command
```bash
# Decrypt and test archive integrity without extracting to disk:
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass file:"/path/to/backup_encryption_key.secret" \
  -in "/path/to/minipos_backup_20261108_1414.tar.gz.enc" | tar -tzf -
```

---

## 4. Backup Retention Policy

| Tier | Frequency | Retention Window | Storage Tier | Redundancy |
| :--- | :--- | :--- | :--- | :--- |
| **Operational Backups** | Daily (Automated) | 14 Days | Local Fast Storage | Single Host |
| **Weekly Snapshots** | Weekly (Sunday 00:00 UTC) | 60 Days | Encrypted Cold Storage | Dual Region |
| **Milestone / Major Deployments** | Before any DDL change | Permanent (1 Year) | Encrypted Cold Vault | Air-Gapped Off-site |

Backups exceeding the retention threshold are securely purged using shredding (`rm -P` or `shred -u`).

---

## 5. Isolated Restore & Recovery Procedure

To prevent accidental data corruption or overwrite of live production databases, all restoration testing must be executed in an isolated test environment.

### Prerequisites
- Local or staging PostgreSQL instance (e.g. Docker container or local PostgreSQL 17 on dedicated port `54322` or `54399`).
- Schema backup `schema.sql` and data backup `data.sql`.
- Checksums verified against `checksums.sha256`.

### Step-by-Step Restoration Protocol

1. **Verify Backup Integrity & Checksums:**
   ```bash
   cd /path/to/backup_directory
   shasum -a 256 -c checksums.sha256
   ```

2. **Spin Up Isolated Recovery Target:**
   ```bash
   # Connect to staging PostgreSQL and initialize a dedicated test database:
   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "DROP DATABASE IF EXISTS minipos_restore_test;"
   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "CREATE DATABASE minipos_restore_test;"
   ```

3. **Restore Database Schema:**
   ```bash
   psql -h 127.0.0.1 -p 54322 -U postgres -d minipos_restore_test -f schema.sql
   ```

4. **Restore Table Data:**
   ```bash
   psql -h 127.0.0.1 -p 54322 -U postgres -d minipos_restore_test -f data.sql
   ```

5. **Verify Restored Integrity & Row Counts:**
   ```sql
   SELECT table_name, (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count
   FROM (
     SELECT table_name,
            query_to_xml(format('SELECT count(*) as cnt FROM public.%I', table_name), false, true, '') as xml_count
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   ) t ORDER BY table_name;
   ```

6. **Tear Down Test Environment:**
   ```bash
   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "DROP DATABASE minipos_restore_test;"
   ```

---

## 6. Disaster Recovery Limitations

1. **Standalone POS Independence:** Mini POS desktop clients store all store settings, product catalogs, customer drafts, sales receipts, and transaction history in local SQLite databases. A complete outage or destruction of the hosted Supabase database has **zero operational impact** on cashiers' ability to ring up sales, print receipts, scan barcodes, or accept cash and UPI payments.
2. **Admin Panel Availability:** Only the web-based Admin Panel (`admin-ui`) relies on the hosted PostgreSQL database for central customer relationship records and administrative audit trails.
3. **Recovery Time Objective (RTO):** Less than 15 minutes for full database reconstitution from encrypted SQL backups.
4. **Recovery Point Objective (RPO):** Maximum 24 hours under standard daily backup schedules; 0 hours for milestone backups taken prior to structural changes.

---

## 7. Verified Baseline Audit (November 8, 2026)

- **Archive Location:** `/Users/laksh/.minipos_secure_backups/hosted_supabase/20261108_1414/minipos_backup_20261108_1414.tar.gz.enc`
- **Encrypted Archive Size:** 133,152 bytes
- **Pre-Migration Unencrypted Checksums:**
  - `schema.sql`: `c5c3f9fcb64230aa2cb31c5b70680f1cd6f7d17a01ced88e47da7fd56dfe9f84`
  - `data.sql`: `ff7fba4fb2fce98c55e79b4c637973a3ecf106559a58ec2f7c2fb1f27b996f7f`
- **Isolated Restoration Test Result:** **PASSED (100% table and record recovery verified)**.

