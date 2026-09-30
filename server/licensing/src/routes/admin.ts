import { Router } from 'express';
import { z } from 'zod';
import { transaction } from '../config/db';
import { AdminLifecycleService, AdminLifecycleError } from '../services/AdminLifecycleService';
import { adminAuth, AdminRequest } from '../middleware/adminAuth';

export const adminRouter = Router();

adminRouter.use(adminAuth);

const releaseBindingSchema = z.object({
  licenseId: z.string().uuid(),
  deviceKeyId: z.string().min(1),
  reason: z.string().min(1)
});

adminRouter.post('/lifecycle/release-binding', async (req: AdminRequest, res, next) => {
  try {
    const { licenseId, deviceKeyId, reason } = releaseBindingSchema.parse(req.body);

    await transaction(async (client) => {
      await AdminLifecycleService.releaseBinding(client, req.adminId!, licenseId, deviceKeyId, reason);
    });

    res.json({ status: 'SUCCESS' });
  } catch (err: any) {
    if (err instanceof AdminLifecycleError) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});

const revokeLicenseSchema = z.object({
  licenseId: z.string().uuid(),
  reason: z.string().min(1)
});

adminRouter.post('/lifecycle/revoke-license', async (req: AdminRequest, res, next) => {
  try {
    const { licenseId, reason } = revokeLicenseSchema.parse(req.body);

    await transaction(async (client) => {
      await AdminLifecycleService.revokeLicense(client, req.adminId!, licenseId, reason);
    });

    res.json({ status: 'SUCCESS' });
  } catch (err: any) {
    if (err instanceof AdminLifecycleError) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});

const restoreLicenseSchema = z.object({
  licenseId: z.string().uuid(),
  reason: z.string().min(1)
});

adminRouter.post('/lifecycle/restore-license', async (req: AdminRequest, res, next) => {
  try {
    const { licenseId, reason } = restoreLicenseSchema.parse(req.body);

    await transaction(async (client) => {
      await AdminLifecycleService.restoreLicense(client, req.adminId!, licenseId, reason);
    });

    res.json({ status: 'SUCCESS' });
  } catch (err: any) {
    if (err instanceof AdminLifecycleError) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    next(err);
  }
});
