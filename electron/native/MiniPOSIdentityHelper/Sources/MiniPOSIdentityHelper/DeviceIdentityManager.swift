// MiniPOS Identity Helper — Device Identity Manager
//
// This is the core identity service. It:
//  1. Checks Secure Enclave availability.
//  2. Generates a P-256 key pair inside the Secure Enclave (on first init).
//  3. Persists the opaque key data representation in Keychain.
//  4. Recovers the key on subsequent launches.
//  5. Derives a stable deviceKeyId from the public key.
//  6. Signs challenge bytes using the Secure Enclave-protected private key.
//
// SECURITY INVARIANTS:
//  ID-SEC-001: Private key is never returned from this class.
//  ID-SEC-005: Production does not silently fall back to software key.
//  ID-SEC-006: Existing identity is not silently replaced when loading fails.
//  ID-SEC-007: deviceKeyId is deterministically derived from the public key.

import Foundation
import CryptoKit

// Encoding helpers (base64url without padding)
private extension Data {
    func base64urlEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

class DeviceIdentityManager {

    // The loaded Secure Enclave private key (held in-process as opaque reference).
    // ID-SEC-001: This is NEVER serialized or returned.
    private var privateKey: SecureEnclave.P256.Signing.PrivateKey?

    // MARK: - Status

    enum IdentityStatus: String {
        case noIdentity        = "NO_IDENTITY"
        case active            = "ACTIVE"
        case keyMissing        = "KEY_MISSING"
        case keyCorrupted      = "KEY_CORRUPTED"
        case seUnavailable     = "SECURE_ENCLAVE_UNAVAILABLE"
    }

    var status: IdentityStatus {
        if !SecureEnclave.isAvailable { return .seUnavailable }
        if privateKey != nil { return .active }
        // Check if Keychain has data but we haven't loaded it yet
        do {
            let data = try KeychainManager.load()
            return data == nil ? .noIdentity : .keyMissing
        } catch {
            return .keyCorrupted
        }
    }

    // MARK: - Initialize / Load

    /// First call: generates and stores a new Secure Enclave key.
    /// Subsequent calls: loads existing key from Keychain.
    /// ID-SEC-006: If data exists but is unreadable, throws — does NOT silently create new identity.
    func initializeOrLoad() throws {
        guard SecureEnclave.isAvailable else {
            throw IdentityError.secureEnclaveUnavailable
        }

        // Attempt to load existing key from Keychain
        if let existingData = try KeychainManager.load() {
            // Reconstruct the Secure Enclave key from its opaque data representation.
            do {
                privateKey = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: existingData)
                // Successfully recovered. Do not generate a new identity.
                return
            } catch {
                // ID-SEC-006: Data exists but is unreadable. This is a KEY_CORRUPTED condition.
                // We MUST NOT silently generate a new key here — that would change the deviceKeyId.
                throw IdentityError.keyCorrupted("Stored key data could not be reconstructed: \(error.localizedDescription)")
            }
        }

        // No existing identity — generate a fresh one.
        let newKey = try SecureEnclave.P256.Signing.PrivateKey()

        // Persist the opaque representation (NOT the plaintext private key).
        try KeychainManager.store(keyData: newKey.dataRepresentation)

        privateKey = newKey
    }

    // MARK: - Public Key

    /// Returns the X9.63 uncompressed public key (65 bytes): 0x04 || X || Y
    /// This is the canonical format transmitted to the licensing server.
    func publicKeyBase64url() throws -> String {
        guard let key = privateKey else { throw IdentityError.identityNotInitialized }
        let x963Bytes = key.publicKey.x963Representation  // always 65 bytes for P-256
        return Data(x963Bytes).base64urlEncoded()
    }

    // MARK: - Device Key ID (ID-SEC-007)

    /// Derives the stable deviceKeyId:
    ///   SHA-256( compressed P-256 public key bytes: 0x02/0x03 || X )
    ///   encoded as lowercase hex.
    ///
    /// Using the compressed form (33 bytes) provides a canonical single representation.
    func deviceKeyId() throws -> String {
        guard let key = privateKey else { throw IdentityError.identityNotInitialized }

        // compressedRepresentation gives us 0x02/0x03 || X (33 bytes, canonical)
        let compressed = key.publicKey.compressedRepresentation
        let digest = SHA256.hash(data: compressed)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Sign Challenge (ID-SEC-001, ID-SEC-009)

    /// Signs the exact bytes provided. No additional transforms are applied here.
    /// The calling layer (TypeScript adapter) is responsible for protocol-level canonicalization.
    ///
    /// Returns a DER-encoded ECDSA-SHA256 signature as base64url.
    func signChallenge(_ challengeData: Data) throws -> String {
        guard let key = privateKey else { throw IdentityError.identityNotInitialized }

        guard !challengeData.isEmpty else {
            throw IdentityError.invalidInput("Challenge data must not be empty")
        }

        guard challengeData.count <= 4096 else {
            throw IdentityError.invalidInput("Challenge data exceeds maximum allowed size (4096 bytes)")
        }

        let signature: P256.Signing.ECDSASignature
        do {
            signature = try key.signature(for: challengeData)
        } catch {
            throw IdentityError.signingFailed(error.localizedDescription)
        }

        // derRepresentation produces the standard ASN.1 DER-encoded signature.
        // This is what the Phase 3 server expects per phase-3.1-crypto-reconciliation-report.md
        return signature.derRepresentation.base64urlEncoded()
    }
}
