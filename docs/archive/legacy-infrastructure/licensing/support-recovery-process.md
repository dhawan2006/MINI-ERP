# Mini POS Support Recovery Process

## Scenario: Lost or Irrecoverable Device
If a device is lost, stolen, or structurally damaged such that the Secure Enclave identity cannot be recovered, the customer will be unable to deactivate their license locally. The server will persistently consider the license bound to the lost device.

## Resolution Workflow
The support administrator MUST perform the following actions:

1. **Verify Customer Identity:**
   Authenticate the request using standard administrative protocols.

2. **Revoke Existing Binding via Admin API:**
   The administrator issues a `release-binding` request for the license to free it up.
   ```
   POST /api/v1/admin/lifecycle/release-binding
   Authorization: Bearer <Admin Token>
   {
     "licenseId": "<UUID>",
     "reason": "DEVICE_LOST"
   }
   ```

3. **Customer Re-Activation:**
   The customer may now enter their License Key into the new device. A brand-new Secure Enclave identity will be generated and bound to the license.

## Security Constraints
- **NO LOCAL FILES:** A copy of `authorization.json` from the old device will instantly fail on the new device due to the Secure Enclave signature mismatch (DEVICE_MISMATCH).
- **NO ACTIVATION CODE REUSE:** Without `release-binding`, the activation code will return `409 Conflict` (License already bound).
