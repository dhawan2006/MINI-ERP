import React from 'react';
import { useLicensingStore } from '../../../application/state/licensingStore';
import { AlertTriangle, AlertCircle } from 'lucide-react';

export const LicensingBanner: React.FC = () => {
  const { status } = useLicensingStore();

  if (!status || status.state === 'ACTIVE' || status.state === 'NOT_ACTIVATED') {
    return null;
  }

  const getBannerContent = () => {
    switch (status.state) {
      case 'EXPIRED':
        return {
          icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
          title: 'License Expired',
          message: `Your Mini POS authorization expired on ${status.validUntil ? new Date(status.validUntil).toLocaleDateString() : 'recently'}. Billing is disabled. Please renew your license.`,
          style: 'bg-amber-50 border-amber-200 text-amber-800'
        };
      case 'DEVICE_MISMATCH':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'Device Mismatch',
          message: 'This license was issued for a different device. Billing is disabled.',
          style: 'bg-red-50 border-red-200 text-red-800'
        };
      case 'DEVICE_IDENTITY_UNAVAILABLE':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'Security Error',
          message: 'Secure device identity is unavailable. Cannot verify authorization.',
          style: 'bg-red-50 border-red-200 text-red-800'
        };
      case 'INVALID_AUTHORIZATION':
      case 'STORAGE_ERROR':
      default:
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'Licensing Error',
          message: 'The local authorization could not be verified. Please contact support.',
          style: 'bg-red-50 border-red-200 text-red-800'
        };
    }
  };

  const content = getBannerContent();

  return (
    <div className={`p-3 border-b flex items-center justify-center space-x-3 ${content.style}`}>
      {content.icon}
      <div>
        <span className="font-semibold">{content.title}: </span>
        <span>{content.message}</span>
      </div>
    </div>
  );
};
