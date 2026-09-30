// MiniPOS Identity Helper — Main Entry Point
//
// Communication protocol:
//   - Reads one JSON request per line from stdin.
//   - Writes one JSON response per line to stdout.
//   - stderr is used for diagnostic logging only.
//
// ID-SEC-011: The helper rejects unknown operations explicitly.
// ID-SEC-012: The helper has no network access and no filesystem escapes.

import Foundation
import CryptoKit
import Security

let manager = DeviceIdentityManager()
let encoder = JSONEncoder()
let decoder = JSONDecoder()

// stderr logging helper — NEVER logs private key material
func log(_ message: String) {
    fputs("[MiniPOSIdentityHelper] \(message)\n", stderr)
}

func sendResponse(_ response: HelperResponse) {
    do {
        let data = try encoder.encode(response)
        if let line = String(data: data, encoding: .utf8) {
            print(line)
            fflush(stdout)
        }
    } catch {
        log("FATAL: Failed to encode response: \(error)")
    }
}

func sendError(requestId: String, error: IdentityError) {
    let response = HelperResponse(
        requestId: requestId,
        success: false,
        result: nil,
        error: ResponseError(code: error.code, message: error.description)
    )
    sendResponse(response)
}

func handle(request: HelperRequest) {
    let id = request.requestId

    guard let op = Operation(rawValue: request.operation) else {
        log("Unknown operation: \(request.operation)")
        sendError(requestId: id, error: .unsupportedOperation(request.operation))
        return
    }

    switch op {

    case .initialize:
        do {
            try manager.initializeOrLoad()
            let keyId = try manager.deviceKeyId()
            log("Identity initialized/loaded. deviceKeyId prefix: \(keyId.prefix(12))...")
            sendResponse(HelperResponse(
                requestId: id,
                success: true,
                result: ResponseResult(
                    status: DeviceIdentityManager.IdentityStatus.active.rawValue,
                    secureEnclaveAvailable: SecureEnclave.isAvailable
                ),
                error: nil
            ))
        } catch let err as IdentityError {
            log("Initialize failed: \(err.code)")
            sendError(requestId: id, error: err)
        } catch {
            log("Initialize unexpected error: \(error)")
            sendError(requestId: id, error: .protocolError(error.localizedDescription))
        }

    case .getStatus:
        let st = manager.status
        sendResponse(HelperResponse(
            requestId: id,
            success: true,
            result: ResponseResult(
                status: st.rawValue,
                secureEnclaveAvailable: SecureEnclave.isAvailable
            ),
            error: nil
        ))

    case .getPublicKey:
        do {
            let pubKey = try manager.publicKeyBase64url()
            sendResponse(HelperResponse(
                requestId: id,
                success: true,
                result: ResponseResult(publicKey: pubKey),
                error: nil
            ))
        } catch let err as IdentityError {
            sendError(requestId: id, error: err)
        } catch {
            sendError(requestId: id, error: .protocolError(error.localizedDescription))
        }

    case .getDeviceKeyId:
        do {
            let keyId = try manager.deviceKeyId()
            sendResponse(HelperResponse(
                requestId: id,
                success: true,
                result: ResponseResult(deviceKeyId: keyId),
                error: nil
            ))
        } catch let err as IdentityError {
            sendError(requestId: id, error: err)
        } catch {
            sendError(requestId: id, error: .protocolError(error.localizedDescription))
        }

    case .signChallenge:
        guard let payload = request.payload,
              let challengeB64 = payload["challengeBase64url"] else {
            sendError(requestId: id, error: .invalidInput("Missing 'challengeBase64url' in payload"))
            return
        }

        // Decode base64url -> raw bytes
        let normalized = challengeB64
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padded = normalized + String(repeating: "=", count: (4 - normalized.count % 4) % 4)
        guard let challengeData = Data(base64Encoded: padded) else {
            sendError(requestId: id, error: .invalidInput("challengeBase64url is not valid base64url"))
            return
        }

        do {
            let sig = try manager.signChallenge(challengeData)
            sendResponse(HelperResponse(
                requestId: id,
                success: true,
                result: ResponseResult(signature: sig),
                error: nil
            ))
        } catch let err as IdentityError {
            sendError(requestId: id, error: err)
        } catch {
            sendError(requestId: id, error: .signingFailed(error.localizedDescription))
        }
    }
}

// ── Main I/O Loop ──
// Reads one JSON line per request. Terminates when stdin closes.
log("MiniPOS Identity Helper started. Protocol: JSONL over stdin/stdout.")

while let line = readLine(strippingNewline: true) {
    let trimmed = line.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { continue }

    guard let requestData = trimmed.data(using: .utf8) else {
        log("Failed to decode stdin line as UTF-8")
        continue
    }

    do {
        let request = try decoder.decode(HelperRequest.self, from: requestData)
        handle(request: request)
    } catch {
        // Malformed JSON — emit a best-effort error response with a sentinel requestId
        log("Malformed request JSON: \(error)")
        let errResp = HelperResponse(
            requestId: "UNKNOWN",
            success: false,
            result: nil,
            error: ResponseError(
                code: "HELPER_PROTOCOL_ERROR",
                message: "Malformed JSON request"
            )
        )
        sendResponse(errResp)
    }
}

log("stdin closed, helper exiting.")
