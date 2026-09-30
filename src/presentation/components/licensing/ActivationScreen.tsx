import React, { useState } from 'react';
import { useLicensingStore } from '../../../application/state/licensingStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AlertCircle, Key, Loader2, ShieldCheck } from 'lucide-react';

export const ActivationScreen: React.FC = () => {
  const [licenseKey, setLicenseKey] = useState('');
  const { activate, isActivating, activationError } = useLicensingStore();

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;
    await activate(licenseKey.trim());
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 text-center">Activate Mini POS</h1>
          <p className="text-slate-500 text-center mt-2">
            Please enter your license key to activate this device.
          </p>
        </div>

        {activationError && (
          <div className="mb-6 p-4 border border-red-200 bg-red-50 text-red-800 rounded-lg flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 mt-0.5" />
            <div>
              <h3 className="font-bold">Activation Failed</h3>
              <p className="text-sm mt-1">{activationError}</p>
              {activationError.includes('identity is unavailable') && (
                <div className="mt-3 p-3 bg-red-100 rounded text-sm font-medium border border-red-200">
                  <p>Your device's secure hardware identity cannot be accessed.</p>
                  <p className="mt-2">If this is a new device or a replacement after damage, please contact support at <strong>support@harji.com</strong> or call <strong>+1-800-555-0199</strong> to release your old device binding.</p>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleActivate} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="licenseKey" className="text-sm font-medium text-slate-700">
              License Key
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <Input
                id="licenseKey"
                type="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                className="pl-10 uppercase font-mono tracking-wider"
                disabled={isActivating}
                required
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-lg"
            disabled={isActivating || !licenseKey.trim()}
          >
            {isActivating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Verifying...
              </>
            ) : (
              'Activate Device'
            )}
          </Button>
        </form>
        
        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs text-center text-slate-400">
            Activation securely binds this device using hardware-backed identity.
          </p>
        </div>
      </div>
    </div>
  );
};
