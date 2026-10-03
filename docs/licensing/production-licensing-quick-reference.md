# QUICK REFERENCE COMMAND SHEET

## CREATE LICENSE
**PURPOSE:** Mint a new production key.
**COMMAND:** Update `.env` to prod, then `npx tsx scripts/generate-real-qa-license.ts`. Revert `.env` immediately.
**READ-ONLY?** NO
**DANGER LEVEL:** MODERATE

## CHECK LICENSE
**PURPOSE:** View license state.
**COMMAND:** `SELECT * FROM licenses WHERE id = 'uuid';`
**READ-ONLY?** YES
**DANGER LEVEL:** NONE

## CHECK BINDING
**PURPOSE:** See what device is using the license.
**COMMAND:** `SELECT * FROM license_bindings WHERE license_id = 'uuid';`
**READ-ONLY?** YES
**DANGER LEVEL:** NONE

## RELEASE BINDING
**PURPOSE:** Free up a seat (e.g. computer broke).
**COMMAND:** 
```bash
curl -X POST https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/admin/lifecycle/release-binding \
  -H "Authorization: Bearer <ADMIN_API_TOKEN>" -H "Content-Type: application/json" \
  -d '{"licenseId": "uuid", "deviceKeyId": "device_uuid", "reason": "Hardware change"}'
```
**READ-ONLY?** NO
**DANGER LEVEL:** MODERATE

## REVOKE LICENSE
**PURPOSE:** Kill a license (e.g. chargeback).
**COMMAND:**
```bash
curl -X POST https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/admin/lifecycle/revoke-license \
  -H "Authorization: Bearer <ADMIN_API_TOKEN>" -H "Content-Type: application/json" \
  -d '{"licenseId": "uuid", "reason": "Chargeback"}'
```
**READ-ONLY?** NO
**DANGER LEVEL:** HIGH

## RESTORE LICENSE
**PURPOSE:** Un-revoke a license.
**COMMAND:**
```bash
curl -X POST https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/admin/lifecycle/restore-license \
  -H "Authorization: Bearer <ADMIN_API_TOKEN>" -H "Content-Type: application/json" \
  -d '{"licenseId": "uuid", "reason": "Resolved"}'
```
**READ-ONLY?** NO
**DANGER LEVEL:** MODERATE

## CLEAN TEST DATA
**PURPOSE:** Wipe test rows.
**COMMAND:** SQL `DELETE FROM license_bindings; DELETE FROM licenses;`
**READ-ONLY?** NO
**DANGER LEVEL:** EXTREME (Verify database first!)
