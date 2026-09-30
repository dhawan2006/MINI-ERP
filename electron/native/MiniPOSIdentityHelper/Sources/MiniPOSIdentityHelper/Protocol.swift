// MiniPOS Identity Helper — IPC Protocol Types
// Defines the JSON request/response envelope for stdin/stdout communication.

import Foundation

// --- Request ---

struct HelperRequest: Decodable {
    let operation: String
    let requestId: String
    let payload: [String: String]?
}

// --- Response ---

struct HelperResponse: Encodable {
    let requestId: String
    let success: Bool
    let result: ResponseResult?
    let error: ResponseError?
}

struct ResponseResult: Encodable {
    // Fields used depending on operation
    var status: String?
    var publicKey: String?          // base64url uncompressed X9.63 (65 bytes)
    var deviceKeyId: String?        // hex-encoded SHA-256 of compressed public key (32 bytes)
    var signature: String?          // base64url-encoded DER ECDSA signature
    var secureEnclaveAvailable: Bool?
}

struct ResponseError: Encodable {
    let code: String
    let message: String
}

// --- Operations ---

enum Operation: String {
    case initialize  = "initialize"
    case getStatus   = "getStatus"
    case getPublicKey = "getPublicKey"
    case getDeviceKeyId = "getDeviceKeyId"
    case signChallenge = "signChallenge"
}
