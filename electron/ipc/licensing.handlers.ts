/**
 * Mini POS — Licensing IPC Handlers (Phase 7)
 *
 * Exposes a narrowly scoped, read-only licensing API to the renderer.
 *
 * SECURITY:
 *   - Renderer can only call getState() — a read operation.
 *   - There is no IPC handler that allows the renderer to SET state.
 *   - All returned data is the safe LicensingStatusDTO (no signatures, keys, or paths).
 *   - Failures return a non-ACTIVE state DTO — never default to ACTIVE.
 *   - The license:stateChanged push event is Main-initiated only.
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { LicensingRuntimeService } from '../licensing/LicensingRuntimeService';
import { LicensingStatusDTO } from '../../src/shared/licensing-dto';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { logger } from '../../src/infrastructure/logging/logger';
import { LicensingLifecycleService } from '../licensing/LicensingLifecycleService';

export function registerLicensingHandlers(
  runtimeService: LicensingRuntimeService,
  lifecycleService: LicensingLifecycleService
): void {

  /**
   * license:getState
   * Returns the current safe licensing DTO.
   * Never returns ACTIVE unless Main has verified the authorization.
   */
  ipcMain.handle(
    'license:getState',
    async (_event: IpcMainInvokeEvent): Promise<IpcResponse<LicensingStatusDTO>> => {
      try {
        const dto = runtimeService.getStatusDTO();
        return { success: true, data: dto };
      } catch (err: any) {
        // Belt-and-suspenders: getStatusDTO() itself never throws, but guard anyway.
        logger.error('LicensingIPC: Unexpected error in license:getState - ' + err?.message);
        // Fail closed — return a non-ACTIVE error DTO.
        return {
          success: false,
          data: { state: 'STORAGE_ERROR' },
          error: { code: 'INTERNAL_LICENSING_ERROR', message: 'Internal licensing error' },
        };
      }
    }
  );

  /**
   * license:activate
   * Initiates the activation workflow.
   */
  ipcMain.handle(
    'license:activate',
    async (_event: IpcMainInvokeEvent, licenseKey: string): Promise<IpcResponse<LicensingStatusDTO>> => {
      try {
        if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim().length === 0) {
          return {
            success: false,
            error: { code: 'INVALID_LICENSE_KEY', message: 'Please provide a valid license key.' },
          };
        }
        
        const dto = await runtimeService.activate(licenseKey.trim());
        return { success: true, data: dto };
      } catch (err: any) {
        logger.error('LicensingIPC: Activation failed - ' + err?.message);
        let errorCode = 'ACTIVATION_FAILED';
        let errorMessage = 'Failed to activate license.';
        
        // Map common errors to friendly codes
        if (err.message.includes('HTTP_404')) {
          errorCode = 'INVALID_LICENSE_KEY';
          errorMessage = 'The license key is invalid or not found.';
        } else if (err.message.includes('HTTP_409')) {
          errorCode = 'ACTIVATION_CONFLICT';
          errorMessage = 'This license has already been activated on the maximum number of devices.';
        } else if (err.message.includes('HTTP_')) {
          errorCode = 'SERVER_ERROR';
          errorMessage = 'The licensing server returned an error. Please try again later.';
          try {
            const jsonStr = err.message.substring(err.message.indexOf(':') + 1).trim();
            if (jsonStr) {
              const parsed = JSON.parse(jsonStr);
              if (parsed.message) errorMessage = parsed.message;
              if (parsed.error) errorCode = parsed.error;
            }
          } catch (e) {
            // ignore parse errors and keep generic message
          }
        } else if (err.message.includes('NETWORK_ERROR')) {
          errorCode = 'NETWORK_ERROR';
          errorMessage = 'Could not connect to the licensing server. Please check your internet connection.';
        } else if (err.message.includes('DEVICE_IDENTITY_UNAVAILABLE')) {
          errorCode = 'DEVICE_ERROR';
          errorMessage = 'Secure device identity is unavailable. Cannot bind license to this device.';
        }
        
        return {
          success: false,
          error: { code: errorCode, message: errorMessage },
        };
      }
    }
  );

  /**
   * license:deactivate
   * Initiates the deactivation workflow.
   */
  ipcMain.handle(
    'license:deactivate',
    async (_event: IpcMainInvokeEvent): Promise<IpcResponse<void>> => {
      try {
        await lifecycleService.requestDeactivation();
        // Since authStore is cleared, we should instruct the runtime service to refresh
        await runtimeService.refreshAfterResume(); // This will clear its state to NOT_ACTIVATED
        return { success: true, data: undefined };
      } catch (err: any) {
        logger.error('LicensingIPC: Deactivation failed - ' + err?.message);
        
        let errorCode = 'DEACTIVATION_FAILED';
        let errorMessage = 'Failed to deactivate license.';
        
        if (err.message.includes('NETWORK_ERROR')) {
          errorCode = 'NETWORK_ERROR';
          errorMessage = 'Could not connect to the licensing server. Deactivation requires an active internet connection.';
        } else if (err.message.includes('NO_ACTIVE_LICENSE')) {
          errorCode = 'INVALID_STATE';
          errorMessage = 'No active license to deactivate.';
        } else if (err.message.includes('HTTP_')) {
          try {
            const jsonStr = err.message.substring(err.message.indexOf(':') + 1).trim();
            if (jsonStr) {
              const parsed = JSON.parse(jsonStr);
              if (parsed.message) errorMessage = parsed.message;
              if (parsed.error) errorCode = parsed.error;
            }
          } catch (e) {
            // ignore
          }
        }

        return {
          success: false,
          error: { code: errorCode, message: errorMessage }
        };
      }
    }
  );

  // NOTE: There is intentionally no 'license:setState' handler.
  // The renderer may only READ state; it cannot write it.
}
