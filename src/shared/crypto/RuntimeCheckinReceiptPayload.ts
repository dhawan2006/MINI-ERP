export interface RuntimeDirective {
  directiveId: string;
  type: string;
  payload: any;
}

export interface RuntimeCheckinReceiptPayload {
  protocolVersion: string;
  policyVersion: number;
  licenseId: string;
  deviceKeyId: string;
  bindingId: string;
  serverTime: string;
  checkInValidUntil: string;
  licenseStatus: string;
  directives: RuntimeDirective[];
}

export interface SignedRuntimeCheckinReceipt {
  signingKeyId: string;
  signature: string;
  protocolVersion: string;
  policyVersion: number;
  licenseId: string;
  deviceKeyId: string;
  bindingId: string;
  serverTime: string;
  checkInValidUntil: string;
  licenseStatus: string;
  directives: RuntimeDirective[];
}
