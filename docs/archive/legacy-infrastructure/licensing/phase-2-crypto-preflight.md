# Phase 2 Crypto Preflight

## 1. Device Challenge Proof (Client → Server)
- **Domain Prefix:** `MINIPOS-DEVICE-CHALLENGE-V1:`
- **Signature Algorithm:** ECDSA using P-256 curve (SHA-256 digest) inside the Secure Enclave via `MiniPOSIdentityHelper` Swift bridge.
- **Canonicalization:** The challenge object is deterministically stringified via `canonicalize()`.
- **Encoding:** The Secure Enclave emits a DER-encoded ECDSA signature, which the Swift helper converts to `base64url` for transmission.
- **Key:** Hardware-backed P-256 private key (never leaves the Secure Enclave).

## 2. Authorization Verification (Server → Client)
- **Domain Prefix:** `MINIPOS-AUTHORIZATION-V1:`
- **Signature Algorithm:** Ed25519.
- **Canonicalization:** The authorization payload object is deterministically stringified via `canonicalize()`.
- **Encoding:** 86-character `base64url` string.
- **Key:** Trusted Server Public Key (loaded from environment or embedded into build artifacts).
- **Verification Order:** 
  1. Extract `signature` and `signingKeyId` from envelope.
  2. Validate types and bounds (e.g. protocolVersion).
  3. Lookup Ed25519 public key by `signingKeyId`.
  4. Canonicalize payload and prepend the domain tag.
  5. Verify using Node's `crypto.verify`.

## 3. Runtime Check-In Receipt Verification (Server → Client)
- **Domain Prefix:** `MINIPOS-RUNTIME-CHECKIN-V1:` (to be implemented)
- **Signature Algorithm:** Ed25519.
- **Canonicalization:** Same deterministic `canonicalize()`.
- **Encoding:** `base64url`.
- **Key:** Same Trusted Server Public Key identified by `signingKeyId`.
- **Verification Order:** Will mirror Authorization Verification but strictly enforcing `licenseId`, `deviceKeyId`, `bindingId`, `policyVersion`, and `checkInValidUntil`.

## Conclusion
The cryptographic primitives are confirmed. 
- The client strictly uses Secure Enclave P-256 for signing out-bound challenges.
- The client strictly uses Ed25519 for verifying inbound server payloads.
- Protocol prefixes are strictly enforced.

The next step is to implement the implementation map.
