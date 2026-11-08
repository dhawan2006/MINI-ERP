# Mini POS: Local QA Install, License Creation, and Admin Panel Guide

**Audience:** Project owner testing Mini POS on a Mac  
**Use:** Local QA and manual testing only  
**Production:** Do not use this guide to create production customer licenses or change production data.

## Read this first: what is ready today

The repository contains a Mac Apple Silicon installer at `release/Mini POS-1.0.0-arm64.dmg`. Its file date is October 16, 2026; it is an older 1.0.0 build and does not automatically include the current uncommitted source changes. The repository also contains a separate admin web panel source. There is no evidence in the current workspace that the DMG was built against the local QA licensing service, so do not assume that activating it will use test data.

There is also a current admin-panel blocker: creating a license requires an **AAL2/MFA** session at the server. The login screen currently signs in with email and password only and does not present the TOTP challenge. The header shows the session assurance level (`AAL1` or `AAL2`). With `AAL1`, the panel may let you open the form, but the server should reject the create action. Do not work around this with a synthetic token for a manual product test.

Before doing a real end-to-end test, have the QA owner/developer confirm that (1) the admin panel points to a designated QA Supabase project or local Supabase, (2) the POS build points to the matching QA licensing endpoint and trusts its matching public key, and (3) the admin login can obtain a real AAL2 session. The previous project notes name a QA project, but this manual does not treat that as verified or connect to it.

## 1. What the parts do

- **Mini POS desktop app:** installed from the DMG. It stores store setup, billing data, device identity, and the signed license authorization on this Mac.
- **Admin panel:** a separate web application used to create customers and licenses and inspect devices. It does not create a desktop installer.
- **Licensing service:** checks the key, associates this Mac with a license seat, and returns a signed authorization. It must match the server/public key configuration baked into or provided to the desktop app.
- **License key:** the one-time plaintext code given to the user. The database stores a one-way hash, so the admin panel cannot show the plaintext key again after its one-time display.
- **License ID:** the record identifier shown in the admin panel. It is not the activation code.
- **Device binding:** the license's record that this Mac has used one of its allowed seats.

Successful testing needs all three pieces to use the same QA environment. If the admin panel saves a key in one database while the POS app sends it to another service, activation will fail with an invalid-key or service error.

## 2. Install the DMG on a test Mac

The supplied DMG is named for **arm64**, intended for Apple Silicon Macs. Do not use it on an Intel Mac unless a separate Intel build is provided.

1. Keep the test key and test data separate from real customer data. Ideally use a spare Mac or a separate macOS user account.
2. In Finder, open the repository's `release` folder and double-click `Mini POS-1.0.0-arm64.dmg`.
3. When the disk image window opens, drag **Mini POS** into **Applications** if the window shows the usual Applications shortcut. Wait for the copy to finish.
4. Eject the mounted Mini POS disk image from Finder's sidebar.
5. Open **Applications**, then open **Mini POS**.
6. If macOS reports that it cannot verify the developer, stop and ask the project owner to provide a properly signed/notarized test build. Do not disable macOS security settings just to continue this test.
7. Note the app version shown by the app or macOS. The DMG is version 1.0.0; it may not represent the current source tree.

Installing the DMG does not start the local licensing server or the admin panel. Those are separate services and must already be configured and running.

## 3. First launch of Mini POS

On a new app data profile, the app guides you through setup:

1. **Set up your store:** enter the store name. It appears on receipts. Select **Continue**.
2. **Activate Mini POS:** enter the QA license key exactly as copied from the admin panel and choose **Activate Device**. The app uppercases the entry. An internet connection is needed for first activation.
3. Wait for activation to finish. A successful server response alone is not enough: the app also checks the server signature and device identity before accepting it.
4. **You're all set:** select **Open Mini POS** to finish setup and open the billing app.

Activation is tied to this Mac's device identity. Do not copy another Mac's application-data folder or authorization file to this one. Do not use a customer's key or a production key in a QA test.

For a repeat test, use a separate test user/profile or ask the developer for the supported test reset procedure. Do not delete Mini POS data folders by guesswork: that can remove local bills and backups as well as the test activation.

## 4. Prepare and open the admin panel

The admin panel source is in `admin-ui/`. Its local default configuration targets Supabase at `http://127.0.0.1:54321`; it is not configured by the desktop DMG. The repository currently has an `.env.test` for automated tests, but that is not a ready-to-use personal admin-panel configuration.

The local developer setup needs these pieces before the panel can work:

1. Docker and the Supabase CLI running the repository's local Supabase stack.
2. Database migrations applied to that local stack.
3. The Admin Edge Function and POS licensing function served locally, with QA-only secrets and the matching QA signing key configured.
4. A local admin Auth user with an `OWNER` or `ADMIN` role. There is no admin-panel screen for creating admin users or assigning roles; a developer must provision this safely in local Supabase.
5. A **real AAL2** sign-in for license creation. The current panel has no TOTP setup/challenge screen, so a password-only login will normally show `AAL1` and cannot submit protected mutations.

When the developer has prepared those items, the panel can be started from the repository with:

```sh
cd admin-ui
npm run dev
```

Open the local URL printed by Vite in the terminal. Sign in with the local QA admin account, not a production admin account. Confirm the header shows the expected role and `AAL2` before attempting to create a license. If it shows `AAL1`, stop: the UI/backend MFA flow needs to be made usable before this manual test can proceed.

The repository's `admin-ui` API has a production fallback URL when built in production mode. Do not build or run a production-configured panel for this QA walkthrough. Confirm the API and Supabase URLs are local or the verified designated QA project before entering credentials.

## 5. Create a customer in the admin panel

Create a customer first so the license can be attached to a named customer.

1. From the left menu, choose **Customers**.
2. Choose **New Customer**.
3. Enter the business name. Contact name, email, and phone are available fields; fill them with test details.
4. Choose **Save/Create** and wait for the list to refresh.
5. Select the new customer row to open its details. Copy its full **Customer ID** if you need it for license creation.
6. To correct contact details later, choose **Edit Customer**, update the fields, and save.

Customer creation and editing are protected mutations and require an authorized role and AAL2. The customer record is an account/contact record; creating it does not itself create a license or activate a Mac.

## 6. Create a license and set its tenure

The panel's license form asks for **Product ID**, **Maximum Devices**, **Valid Until**, and optional **Customer ID**. There is no “one month/one year” selector; choose the calendar date and time yourself.

1. Check the panel header shows an authorized role and `AAL2`.
2. Choose **Licenses** in the left menu, then **New License**.
3. **Product ID:** enter the product identifier expected by your test setup. It is a required text field. It is not the license key and does not choose the server environment.
4. **Maximum Devices:** for a one-Mac test, enter `1`. This is the total number of active device bindings allowed at once.
5. **Valid Until:** choose a future local date and time. This date is the end of the license tenure. The backend sets `Valid From` to the current time unless supplied by another client. For example, for a test ending on November 7, choose November 7 at the desired local end time; check the displayed date and time carefully before saving.
6. **Customer ID:** enter the full ID copied from the customer detail page. The field is optional in the UI, but attaching the test license to the customer is recommended. Do not use the all-zero sentinel ID.
7. Choose **Create** once. Wait for the one-time key panel to appear.
8. Copy the plaintext key immediately into a secure temporary note for this test. Keep the License ID separately for finding the record. Do not refresh or close the one-time key panel before copying; the plaintext cannot be retrieved later from the database or license detail page.
9. Confirm the new license appears in the list with status `ACTIVE`, the expected customer, end date, and device limit.
10. Open the license row and verify its **Valid From**, **Valid Until**, **Maximum Devices**, and customer association.

License creation records an audit event. The key is generated by the server and only its hash is stored. Creating the license does not activate any device yet.

### Extend the tenure later

1. Open **Licenses**, select the license, then choose **Extend**.
2. Choose a new **Valid Until** date/time later than the current end date.
3. Enter a reason in **Reason for Audit Log** (for example, `QA tenure extension test`).
4. Choose **Extend** and confirm the license detail page shows the new end date.

An extension changes the server-side license end date and is protected by AAL2. Do not rely on extending a license to retroactively fix an already-issued offline authorization; activate/check in again and verify the app's state for the behavior under test.

## 7. Activate the test Mac with the new key

1. Make sure the Mac has internet access and the POS app is configured for the same QA licensing service/key used by the admin panel.
2. In Mini POS, enter the copied key in **Activate Mini POS** and choose **Activate Device**.
3. On success, finish the setup and open the POS.
4. In the admin panel, open **Devices** and refresh/search by the device entry if needed. Open the device to review its binding history.
5. Open the license detail page and check the device limit and active status. With `Maximum Devices = 1`, activating another Mac should be refused while this binding remains active.

The app has a separate runtime check-in flow. Use a network connection for activation and for any test specifically checking online renewal/check-in. Ordinary POS billing is designed to continue offline while the locally signed authorization remains valid; an offline test is not evidence that the server is reachable.

## 8. Admin panel: what each area does

### Dashboard

Shows summary counts such as customers, active licenses, device bindings, and revoked licenses, subject to the signed-in role and its data scope. Use it as an overview, not as a substitute for opening a customer, license, or device record to verify details.

### Customers

- List, search, paginate, open details, create, and edit customer contact information.
- There is no delete-customer action in the current UI.
- Customer create/edit needs a permitted role and AAL2.

### Licenses

- List, search, paginate, open details, and create a license.
- The key is revealed once at creation. Copy it immediately.
- Detail actions include **Extend**, **Disable**, **Restore**, and **Revoke**, subject to role and state.
- **Disable** prevents normal licensed operation but can later be restored.
- **Restore** is for a `DISABLED` license. It does not automatically reactivate old devices.
- **Revoke** is described in the UI as final and also deactivates active bindings. Avoid it for routine testing; use a disposable QA license.
- All lifecycle actions require a reason and AAL2. Revocation is the most destructive action in the panel.

### Devices

- List, search by device key ID, paginate, and inspect a device's status, dates, activity, and binding history.
- **Release Binding** deactivates the selected license/device association and frees that seat for another device. It requires a reason and AAL2.
- Releasing a binding does not delete the device or erase local business data from the Mac.
- Do not release a binding unless you have confirmed the device and license IDs; for a test, this is how to free a seat after a deliberately tested transfer.

### Audit Logs and Settings

These menu items currently open placeholder pages saying the module is pending implementation. They do not currently provide functioning audit-log browsing or panel settings. Audit events are still written by backend operations, but these pages do not display them.

### Role limits

The UI and backend apply roles. `OWNER` and `ADMIN` can manage the main customer/license lifecycle functions. `FINANCE` can see and create customers/licenses but cannot access Devices; backend role rules are authoritative. `SUPPORT` and `AUDITOR` are primarily read-only for licenses/devices, with different visibility. The UI hiding a button is not the security control; the server also checks role and MFA.

## 9. Common problems and what to check

| What you see | Check |
|---|---|
| Admin login succeeds but license creation returns 403 | Check header role and AAL. `AAL1` is insufficient for create/extend/disable/restore/revoke/release. The current panel lacks an MFA challenge screen. |
| Admin page says it cannot reach the service | Confirm local Supabase is running, the Admin function is served, and `VITE_ADMIN_API_URL` points to the same local/QA environment as the Auth URL. |
| POS says key invalid | Confirm the key was copied completely, the license was created in the same QA database used by the POS licensing endpoint, and the app's trusted public key/key ID match that service. |
| POS cannot contact the licensing service | Confirm the correct QA server/function is running, the Mac has network access, and the desktop build was configured for that QA endpoint. |
| Device limit reached | Review active bindings in Devices/license detail. Use **Release Binding** only for a genuinely disposable QA binding and only after identifying it. |
| Activation reports device mismatch | The authorization belongs to another device identity. Do not copy authorization files; release the old QA binding if appropriate, then activate on this Mac again. |
| Billing is blocked after activation | Check the license end date/status and whether the app needs an online check-in for this test. Do not revoke a license as a troubleshooting step. |

## 10. Safe manual test sequence

For a clean end-to-end check, use this order:

1. Verify all URLs are local or to the designated QA project. Confirm none point to production.
2. Verify the DMG version and QA target; rebuild a QA-specific DMG if the current 1.0.0 artifact's endpoint/key is unknown.
3. Start the QA database/functions/licensing service and confirm they are healthy.
4. Sign in to the admin panel with a QA admin whose header shows `AAL2`.
5. Create a test customer.
6. Create a one-device license with a near-future `Valid Until`, then copy the one-time key.
7. Install/open the QA desktop build on a test Mac and activate with that key.
8. Check the device binding appears under the correct customer/license.
9. Exercise one non-destructive lifecycle test (for example, extend the end date) and verify the detail page.
10. If testing device transfer, release the test binding with an audit reason, then activate on the replacement test device.
11. Keep the test key and IDs labelled as QA. Do not use production data or credentials.

## 11. Current items that must be resolved for this manual to be fully executable

These are observed from the source and workspace, not guesses about a remote service:

1. The existing DMG is an older build and its licensing target has not been confirmed as QA.
2. The admin UI has no local `.env.local` setup in the workspace; its defaults are localhost. A QA configuration must be supplied and checked.
3. The Admin panel login has no MFA enrollment/challenge screen, while license creation and lifecycle changes require AAL2. A real AAL2-capable UI/session path is needed for the requested click-through.
4. The panel has no user/role provisioning screen. A QA admin identity and role must be provisioned in the target test environment.
5. Audit Logs and Settings are placeholders, not implemented controls.
6. The local QA historical report describes successful tests, but the licensing package currently has no documented `start` script. The exact safe command/configuration for starting the local QA server must be confirmed before manual activation.

Therefore, the install and panel workflows above describe the actual screens and intended QA sequence, but the current workspace does not yet establish that the DMG + admin panel can complete a fresh end-to-end QA run without environment/MFA setup work. Do not use the existing DMG with a real customer key to find out.
