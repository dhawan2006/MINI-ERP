import Foundation
import Security

enum IdentityError: Error, CustomStringConvertible {
    case secureEnclaveUnavailable
    case identityNotInitialized
    case keyNotFound
    case keyCorrupted(String)
    case keychainAccessFailed(OSStatus)
    case signingFailed(String)
    case invalidInput(String)
    case unsupportedOperation(String)
    case protocolError(String)

    var code: String {
        switch self {
        case .secureEnclaveUnavailable:   return "SECURE_ENCLAVE_UNAVAILABLE"
        case .identityNotInitialized:     return "IDENTITY_NOT_INITIALIZED"
        case .keyNotFound:                return "KEY_NOT_FOUND"
        case .keyCorrupted:               return "KEY_CORRUPTED"
        case .keychainAccessFailed:       return "KEYCHAIN_ACCESS_FAILED"
        case .signingFailed:              return "SIGNING_FAILED"
        case .invalidInput:               return "INVALID_CHALLENGE_INPUT"
        case .unsupportedOperation:       return "UNSUPPORTED_OPERATION"
        case .protocolError:              return "HELPER_PROTOCOL_ERROR"
        }
    }

    var description: String {
        switch self {
        case .secureEnclaveUnavailable:
            return "macOS Secure Enclave is not available on this device."
        case .identityNotInitialized:
            return "Device identity has not been initialized."
        case .keyNotFound:
            return "Device key not found. Identity may have been lost."
        case .keyCorrupted(let detail):
            return "Device key data is corrupted: \(detail)"
        case .keychainAccessFailed(let status):
            return "Keychain access failed (OSStatus: \(status))."
        case .signingFailed(let detail):
            return "Cryptographic signing failed: \(detail)"
        case .invalidInput(let detail):
            return "Invalid input: \(detail)"
        case .unsupportedOperation(let name):
            return "Unsupported operation: \(name)"
        case .protocolError(let detail):
            return "Protocol error: \(detail)"
        }
    }
}
