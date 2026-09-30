import { z } from 'zod';

export const createLicenseSchema = z.object({
  productId: z.string().min(1).max(255),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  maxDevices: z.number().int().positive(),
}).refine(data => new Date(data.validFrom) < new Date(data.validUntil), {
  message: "validFrom must be before validUntil",
  path: ["validUntil"]
});

export const activationChallengeSchema = z.object({
  deviceKeyId: z.string().min(1).max(255),
});

export const activateLicenseSchema = z.object({
  licenseKey: z.string().min(10),
  publicKey: z.string().min(1),
  challengeSignature: z.string().min(1),
  activationRequestId: z.string().uuid(),
});

export const deactivateLicenseSchema = z.object({
  licenseId: z.string().uuid(),
  deviceKeyId: z.string().min(1),
  deactivationChallengeSignature: z.string().min(1),
});
