export interface AuthorizationPayload {
  protocolVersion: number;
  authorizationVersion: number;
  licenseId: string;
  productId: string;
  deviceKeyId: string;
  validFrom: string; // ISO8601
  validUntil: string; // ISO8601
  issuedAt: string; // ISO8601
  signingKeyId: string;
}

export type SignedAuthorization = AuthorizationPayload & {
  signature: string; // base64url encoded
};
