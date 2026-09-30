# Mini POS — Phase 3.1 Crypto Architecture Reconciliation Report

## 1. Platform Capability Findings

An engineering review of Apple's current documentation and platform APIs confirms the following limitations regarding macOS hardware-backed cryptography:

**A. Can a macOS Secure Enclave generate and use an Ed25519 private signing key?**
**NO.** The macOS Secure Enclave coprocessor does not support the Ed25519 (Curve25519) algorithm. Its hardware accelerators are strictly limited to NIST P-256 (secp256r1) elliptic curve cryptography.

**B. Can a macOS Secure Enclave generate and use a P-256 signing key?**
**YES.** P-256 ECDSA is natively supported and is the primary curve utilized by the Secure Enclave (e.g., via `SecureEnclave.P256.Signing.PrivateKey`).

**C. Can CryptoKit perform Ed25519 signing using Curve25519 outside the Secure Enclave?**
**YES.** `Curve25519.Signing.PrivateKey` can be generated and used for signatures in software memory outside the enclave.

**D. Can such a Curve25519/Ed25519 private key be stored in Keychain?**
**YES.** Ed25519 keys can be persisted in the standard macOS Keychain as generic passwords or raw key representations. However, they cannot be created using the `kSecAttrTokenIDSecureEnclave` attribute.

**E. Security properties: Secure Enclave P-256 vs. Keychain Ed25519?**
The Secure Enclave provides a hardware-level **non-exportability guarantee**. The private key material never leaves the dedicated coprocessor; the OS merely asks the enclave to sign hashes. Standard Keychain storage relies on software-level protection. A highly privileged attacker (e.g., root exploit) could potentially extract an Ed25519 key from memory when it is loaded by the app for signing, whereas a Secure Enclave P-256 key is fundamentally immune to software extraction.

## 2. Current Phase 3 Model

Phase 3 currently implements **Design A**:
- **Server:** Ed25519
- **Device:** Ed25519

## 3. Compatibility Problem

Phase 4 mandates the use of the macOS Secure Enclave for ultimate device-binding security. Because Secure Enclave hardware strictly forbids Ed25519 keys, maintaining the current Phase 3 protocol would force a silent downgrade to software-backed Keychain storage, violating the hardware-isolation goals of Phase 4.

## 4. Design A Analysis (Server Ed25519 / Device Ed25519)

- **Cryptographic security:** Excellent. Fast, small signatures, immune to ECDSA nonce biases.
- **Hardware backing:** None. Forced to use software-backed Keychain.
- **Key extraction resistance:** Vulnerable to root-level memory scraping or Keychain extraction exploits.
- **Implementation complexity:** Low (symmetric primitives on both sides).
- **macOS support:** Supported via CryptoKit, but not via Secure Enclave.
- **Server compatibility:** Supported (Node.js `crypto`).
- **Electron compatibility:** Low native friction.
- **Native helper requirements:** macOS Swift bridging required.
- **Future Windows compatibility:** Windows TPM (CNG) heavily favors RSA and NIST curves (P-256). Ed25519 support in Windows TPM is historically poor.

## 5. Design B Analysis (Server Ed25519 / Device P-256 ECDSA)

- **Cryptographic security:** Very high (standard NIST curves).
- **Hardware backing:** Full macOS Secure Enclave support.
- **Key extraction resistance:** Complete physical immunity to software extraction. Key resides in the coprocessor.
- **Implementation complexity:** Moderate (different primitives for Server vs Device proofs).
- **macOS support:** First-class citizen (`SecureEnclave.P256`).
- **Server compatibility:** Fully supported via Node.js `crypto` (`crypto.verify` handles ECDSA).
- **Electron compatibility:** N/A (handled natively).
- **Native helper requirements:** Required for Secure Enclave interaction.
- **Future Windows compatibility:** High. Windows TPM strongly supports P-256 for Virtual Smart Cards and Platform Crypto Providers.

## 6. Chosen Architecture

**DESIGN B IS SELECTED.**
To honor the Phase 4 hardware-backing requirements and provide ultimate protection against license-cloning attacks, the device identity must be generated inside the Secure Enclave. This mandates changing the Device Proof algorithm to P-256 ECDSA.

## 7. Required Specification Changes

`docs/licensing-specification-v1.md` has been explicitly updated:
- The device key pair is now strictly defined as `P-256 (secp256r1) ECDSA`.
- Device Proof Algorithm is set to P-256 ECDSA with DER signature encoding.
- The Server Authorization Algorithm remains Ed25519.

## 8. Required Protocol Changes

Phase 3 Server Implementation (`DeviceProofVerifier.ts`) must be updated to:
1. Parse P-256 Public Keys (SPKI format).
2. Validate DER-encoded ECDSA signatures.
3. Reject Ed25519 device signatures.
*(Note: These code changes are scoped for Phase 4 implementation, as instructed to hold code changes in Phase 3.1).*

## 9. Test-Vector Impact

The auto-generated `tests/fixtures/crypto/vector1.json` currently verifies **Server Authorization Signing** only (which remains Ed25519). Thus, `vector1.json` does not need to be regenerated.
However, a new `vector2.json` must be generated in the future to model the **P-256 ECDSA Device Proof**.

## 10. Security Guarantee Check

1. **Can the device private key be exported?** NO (locked in hardware Secure Enclave).
2. **Can renderer code access it?** NO.
3. **Can Electron Main access raw private-key bytes?** NO (only opaque key references).
4. **Can another machine reproduce the device signature?** NO.
5. **Can copied authorization be used on another device?** NO (Device Proof will fail).
6. **Can a modified authorization pass verification?** NO.
7. **Can a replayed challenge succeed?** NO.
8. **Can two simultaneous challenge consumes succeed?** NO.

## 11. Phase 4 Prerequisites

- `DeviceProofVerifier.ts` must be refactored to verify P-256 ECDSA signatures.
- Phase 3 Device tests must be updated to generate P-256 test keys.
- Native macOS Helper (Swift) must be scaffolded to target `SecureEnclave.P256`.

**NO APPLICATION CODE OR NATIVE HELPERS WERE IMPLEMENTED IN THIS PHASE.**
