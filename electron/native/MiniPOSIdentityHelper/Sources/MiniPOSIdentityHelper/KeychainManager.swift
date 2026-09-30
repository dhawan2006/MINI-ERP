// MiniPOS Identity Helper — Keychain Manager
// Handles storage and retrieval of the Secure Enclave key's protected data representation.
//
// DESIGN: The Secure Enclave P-256 private key is never stored as plaintext.
// Instead, its `dataRepresentation` (an opaque, encrypted blob only usable by
// this device's Secure Enclave) is stored in the user's Keychain.
//
// Keychain attributes:
//   kSecClass:           kSecClassGenericPassword
//   kSecAttrService:     "com.minipos.device-identity"
//   kSecAttrAccount:     "secure-enclave-key-v1"
//   kSecAttrAccessible:  kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
//
// Access policy rationale:
//   kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly is chosen because:
//   1. Mini POS may start at system boot (e.g., startup item) before the user
//      has opened their session, but AFTER first unlock.
//   2. The "ThisDeviceOnly" suffix prevents iCloud Keychain sync, ensuring the
//      device key cannot migrate to another machine.
//   3. We do NOT require biometric unlock because that would interrupt the
//      cashier during normal billing operations.

import Foundation
import Security

enum KeychainManager {

    private static let service = "com.minipos.device-identity"
    private static let account = "secure-enclave-key-v1"

    // Stores the Secure Enclave key's opaque data representation.
    // ID-SEC-004: This blob is NOT the plaintext private key.
    static func store(keyData: Data) throws {
        // Delete any existing entry first (idempotent upsert).
        deleteExisting()

        let query: [String: Any] = [
            kSecClass as String:            kSecClassGenericPassword,
            kSecAttrService as String:      service,
            kSecAttrAccount as String:      account,
            kSecAttrAccessible as String:   kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String:        keyData
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw IdentityError.keychainAccessFailed(status)
        }
    }

    // Loads the opaque key data representation from Keychain.
    // Returns nil if not found (identity not yet initialized).
    static func load() throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String:            kSecClassGenericPassword,
            kSecAttrService as String:      service,
            kSecAttrAccount as String:      account,
            kSecMatchLimit as String:       kSecMatchLimitOne,
            kSecReturnData as String:       true
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        switch status {
        case errSecSuccess:
            guard let data = item as? Data else {
                throw IdentityError.keyCorrupted("Keychain returned unexpected data type")
            }
            return data
        case errSecItemNotFound:
            return nil
        default:
            throw IdentityError.keychainAccessFailed(status)
        }
    }

    // Permanently removes the stored key data. Used during recovery flows only.
    @discardableResult
    static func deleteExisting() -> Bool {
        let query: [String: Any] = [
            kSecClass as String:        kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  account
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
