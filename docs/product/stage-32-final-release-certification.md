# Stage 32 — Human Acceptance & Final Release Certification

**Date:** 2026-09-20  
**Version:** Mini POS 1.0.0  

---

## 1. Automated Baseline

The automated test baseline remains passing with no regressions:

* **Unit/Integration:** 108/108 passed
* **E2E:** 26/26 passed
* **Total:** 134/134 passed (0 failed, 0 skipped)

---

## 2. Freeze the Release Candidate

The exact Stage 31 artifact is frozen for this testing:

```text
Filename: Mini POS-1.0.0-arm64.dmg
Version: 1.0.0
Architecture: macOS Apple Silicon (arm64)
SHA-256: e754448f21f5a8954f8103c3d9fa783b498a00fea888738f9913691e8455da92
Build timestamp: 2026-09-20T19:00:48+0530
```

---

## 3. macOS Environment (Manual DMG Installation)

```text
OS version: NOT TESTED (Human intervention required)
Mac model: NOT TESTED (Human intervention required)
Install result: NOT TESTED
Launch result: NOT TESTED
Gatekeeper behavior: NOT TESTED
```

*Note: Automated agents cannot perform manual macOS DMG installation and GUI verification. This requires a human operator.*

---

## 4. Packaged Application Smoke Test

```text
Launch → NOT TESTED
Billing → NOT TESTED
Product Management → NOT TESTED
create product → NOT TESTED
search product → NOT TESTED
create bill → NOT TESTED
finalize → NOT TESTED
History → NOT TESTED
Settings → NOT TESTED
```

*Note: Requires human verification of the packaged application.*

---

## 5. Physical Barcode Scanner Acceptance

```text
PHYSICAL SCANNER: NOT TESTED

Manufacturer: NOT TESTED
Model: NOT TESTED
Connection: NOT TESTED
Barcode type: NOT TESTED
Scanner suffix: NOT TESTED
```

*Note: Hardware QA not executed. A physical USB keyboard-wedge scanner must be connected and verified by a human operator.*

---

## 6. Physical Thermal Printer Acceptance

```text
PHYSICAL PRINTER: NOT TESTED

Manufacturer: NOT TESTED
Model: NOT TESTED
Connection: NOT TESTED
Paper width: NOT TESTED
```

*Note: Hardware QA not executed. A physical ESC/POS thermal printer must be connected and verified by a human operator.*

---

## 7. Packaged Backup & Restore Tests

### Packaged Backup Test
```text
create known data → NOT TESTED
Backup Database → NOT TESTED
choose destination → NOT TESTED
verify .db exists → NOT TESTED
open/inspect backup → NOT TESTED
integrity_check → NOT TESTED
```

### Packaged Restore Test
```text
create initial data → NOT TESTED
Backup → NOT TESTED
create additional newer data → NOT TESTED
restore initial backup → NOT TESTED
application restarts → NOT TESTED
verify initial data exists → NOT TESTED
verify newer data is gone → NOT TESTED
create new product → NOT TESTED
create/finalize new bill → NOT TESTED
open History → NOT TESTED
```

### Packaged Active-Draft Protection
```text
create active bill → NOT TESTED
do not finalize → NOT TESTED
attempt Restore → NOT TESTED
```

---

## 8. Real-World Backup/Restore Safety

* Operator understanding: Pending human acknowledgment of the destructive nature of Restore and active-draft blocking.

---

## 9. Signing / Notarization

* **Developer ID Application certificate:** Not available.
* **Notarization:** Not performed.
* **Gatekeeper:** Artifact is ad-hoc signed only. `spctl --assess` fails.
* **Deployment Model:** Manual operator distribution only. Operator must explicitly bypass Gatekeeper (e.g., Right-click -> Open).

---

## 10. Windows

`NOT VALIDATED`

No Windows build or test has been performed.

---

## 11. Known Limitations

* **No Apple code signing or notarization:** Gatekeeper warning on first launch; requires user bypass.
* **Restore `filePath` boundary:** IPC path trust requires mitigation checks (already implemented).
* **Bill number resets:** Sequence resets to max after restore.
* **Hardware QA unverified:** Physical barcode scanner and receipt printer not verified.
* **Windows unverified:** Windows deployment not validated.

---

## 12. Final Decision

### `V1 RELEASE BLOCKED — HARDWARE`

**Reasoning:**
This stage is the final human acceptance gate, but automated systems cannot perform physical hardware verification (barcode scanner, thermal printer) or manual DMG installation and smoke testing. 

The software passes all automated validation gates, but release remains strictly blocked until a human operator completes Sections 3 through 7 of this document.
