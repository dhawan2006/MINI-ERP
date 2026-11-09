# Mini POS — Windows Desktop Acceptance & QA Testing Guide

## Purpose

This engineering guide provides the formal acceptance testing protocol for **Mini POS (v1.0.0, `com.minipos.app`)** on **Windows 10 and Windows 11 x64**. It addresses macOS developers who need to remotely access and validate the Windows desktop experience on native x64 cloud infrastructure without owning a physical Windows laptop.

---

## 1. Remote Windows x64 Testing Environments (from macOS)

### Why Windows on ARM (Parallels / UTM on Apple Silicon) is Insufficient
Apple Silicon Macs run ARM64 processors. Running Windows 11 inside Parallels Desktop or UTM runs **Windows 11 on ARM64**, which translates x64 binaries using Microsoft's Prism emulation layer. Emulation cannot certify:
1. Native x86_64 CPU instructions and memory alignment.
2. Native Node-API prebuilt binary loading (`win32-x64.node`).
3. Hardware driver communication (ESC/POS thermal printers, COM ports, USB).
4. Native Windows x64 crashpad and unhandled exception behavior.

### Recommended Remote Desktop Environment Matrix

| Solution | Recommended Plan | Estimated Cost | Setup Effort | Best For |
|---|---|---|---|---|
| **Microsoft Azure VM (Recommended)** | `Standard_B2s` (2 vCPU, 4GB RAM) or `Standard_D2s_v5` | ~$0.05 – $0.096 / hr | 10 mins | True consumer Windows 11 Pro desktop experience, Start Menu, Defender SmartScreen. |
| **AWS EC2** | `t3.medium` (2 vCPU, 4GB RAM, Windows Server 2022 AMI) | ~$0.046 / hr | 10 mins | Fast provisioning via AWS Console / CLI. |
| **GitHub Actions Interactive RDP** | GitHub Actions `windows-latest` runner with Cloudflare Tunnel / ngrok | $0.00 | 5 mins | Zero cost; uses the identical runner from CI. |

> [!CAUTION]
> In strict accordance with engineering policy, **never purchase or provision a paid cloud instance without explicit developer approval**. When provisioned, always shut down and deallocate instances immediately after testing to prevent unexpected hourly charges.

### Setup Instructions for Microsoft Azure VM (Windows 11)
1. **Provision Instance**:
   - In Azure Portal, create a Virtual Machine:
     - Image: `Windows 11 Pro, version 23H2 - x64 Gen2`.
     - Size: `Standard_B2s` (2 vCPU, 4 GiB memory).
     - Inbound port: Allow `RDP (3389)` from your specific public IP address.
2. **Connect from macOS**:
   - Download **Microsoft Remote Desktop** (free from the Mac App Store).
   - Add PC using the Public IP address of the Azure VM.
   - Enter credentials and connect.
3. **Download Installer**:
   - Open Microsoft Edge in the remote session.
   - Download `Mini POS Setup 1.0.0.exe` directly from the GitHub Actions run artifact or release page.

---

## 2. Interactive Installation Test Protocol (Stage 3)

1. **Verify Binary Integrity**:
   - In PowerShell, run:
     ```powershell
     Get-FileHash .\Mini POS Setup 1.0.0.exe -Algorithm SHA256
     ```
   - Must match: `D9F6183D2557472A30F22DDFFD0BE3EC2CFC6C9367376FB86E562F10CD67F14F`.
2. **Launch Installer (Interactive GUI)**:
   - Double-click `Mini POS Setup 1.0.0.exe`.
   - **SmartScreen Verification**: Because the installer is unsigned, Windows SmartScreen will display *"Windows protected your PC"*. Click *"More info > Run anyway"*.
   - **Elevation Verification**: Confirm **NO** Windows User Account Control (UAC) shield icon is shown and no administrative credentials are requested (`requestedExecutionLevel: asInvoker`).
3. **Wizard Verification**:
   - Destination Directory: Verify default points to `%LOCALAPPDATA%\Programs\Mini POS`.
   - Click **Install**.
   - Confirm extraction progress bar completes smoothly.
   - Completion screen: Confirm "Run Mini POS" checkbox is visible.
4. **Shortcuts Verification**:
   - Start Menu: Confirm `Mini POS` appears in Start Menu list.
   - Desktop: Confirm `Mini POS` shortcut with the custom blue cash-register icon is created on the Desktop.

---

## 3. Business Workflow Acceptance Matrix (Stage 4)

| Feature | Action / Test Steps | Expected Result | Codebase Status |
|---|---|---|---|
| **First Launch Onboarding** | Launch Mini POS from Desktop shortcut with no existing DB. | `<SetupLayout>` opens showing Welcome screen. | **IMPLEMENTED** |
| **Store Name Profile** | Enter `Corner Grocery & Cafe`, click Continue. | Status transitions to `IN_PROGRESS`, name stored. | **IMPLEMENTED** |
| **Complete Setup** | Click "Get Started" on the completion screen. | Status transitions to `COMPLETED`, opens `<BillingLayout>`. | **IMPLEMENTED** |
| **Product Creation** | Switch to Products view (or press shortcut). Add "Milk 1L", price `50.00`, barcode `890123456`. | Product is saved in SQLite `products` table. | **IMPLEMENTED** |
| **Product Barcode Search** | In Billing view, type or scan `890123456` into the search box. | Product instantly populates with 1 qty and `₹50.00`. | **IMPLEMENTED** |
| **Draft Management** | Increase quantity to 3, add second item. Verify total is calculated from `price_minor * qty`. | Line totals and bill total reflect exact integer math. | **IMPLEMENTED** |
| **Bill Finalization** | Click Finalize Bill. | Bill record written to `bills` table with sequential number. Active draft cleared. | **IMPLEMENTED** |
| **Bill History** | Switch to History view. Click finalized bill. | `<HistoryDetailsPanel>` renders items, timestamp, and total. | **IMPLEMENTED** |
| **PDF Receipt Export** | Click "Export PDF" in History view. | Windows Save Dialog prompts for destination. Valid PDF created with embedded Roboto font. | **IMPLEMENTED** |
| **Discounts / Markdowns** | N/A | **NOT IMPLEMENTED** in Mini POS v1.0.0. | **N/A** |
| **Customer Management** | N/A | Customers default to "Walk-in Customer". No standalone customer entity in v1.0.0. | **N/A** |
| **Payment Mode Selection** | N/A | Single unified payment settlement; no separate Cash/UPI mode switcher in v1.0.0. | **N/A** |

---

## 4. Windows Filesystem & Path Verification (Stage 5)

Run the following in PowerShell after testing:

```powershell
# 1. Verify Application Binary Directory (Read-only application files)
Test-Path "$env:LOCALAPPDATA\Programs\Mini POS\Mini POS.exe"
# Expected: True

# 2. Verify User Database Directory (Persistent data)
Test-Path "$env:APPDATA\Mini POS\mini-erp-data\billing.db"
# Expected: True

# 3. Confirm NO live database exists in Program Files or install directory
Test-Path "C:\Program Files\Mini POS\billing.db"
# Expected: False
Test-Path "$env:LOCALAPPDATA\Programs\Mini POS\billing.db"
# Expected: False

# 4. Verify Logs
Get-Content "$env:APPDATA\Mini POS\logs\main.log" -Tail 20
```

---

## 5. Uninstallation and Data Preservation (Stage 7)

1. Open Windows **Settings > Apps > Installed apps** (or `appwiz.cpl`).
2. Locate **Mini POS** and click **Uninstall**.
3. Confirm uninstaller removes `%LOCALAPPDATA%\Programs\Mini POS` and shortcuts.
4. **Data Preservation Check**:
   ```powershell
   Test-Path "$env:APPDATA\Mini POS\mini-erp-data\billing.db"
   ```
   **Must return `True`**. The customer's sales history, product catalog, and store settings must remain intact.
5. Reinstall the app. Launch Mini POS. Confirm all prior products and bill history load immediately without re-prompting for onboarding setup.

---

## 6. Printer Verification Protocol (Stage 9)

- **Network ESC/POS**: Configurable in Settings (`127.0.0.1` or LAN IP, port `9100`). Fully implemented.
- **USB ESC/POS**: Explicitly stubbed (`PRINTER_UNSUPPORTED`). Do not test until physical thermal hardware is connected.
- **PDF Receipt**: Fully verified; generates standard A4 / 80mm receipt PDFs.
