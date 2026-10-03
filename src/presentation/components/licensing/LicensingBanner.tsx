import React from 'react';
import { useLicensingStore } from '../../../application/state/licensingStore';
import { AlertTriangle, AlertCircle } from 'lucide-react';

export const LicensingBanner: React.FC = () => {
  const { status, verifyNow } = useLicensingStore();

  if (!status || status.state === 'NOT_ACTIVATED') {
    return null;
  }

  // Active without any check-in warnings -> don't show banner
  if (status.state === 'ACTIVE' && (!status.checkInState || status.checkInState === 'CURRENT')) {
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
      case 'REVOKED':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'License Revoked',
          message: 'This license has been permanently revoked by the administrator. Billing is disabled.',
          style: 'bg-red-50 border-red-200 text-red-800'
        };
      case 'DISABLED':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'License Disabled',
          message: 'This license is temporarily disabled. Billing is disabled.',
          style: 'bg-red-50 border-red-200 text-red-800'
        };
      case 'CHECKIN_OVERDUE':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'Check-In Overdue',
          message: 'Your Mini POS license failed to verify over the internet for 7 days. Billing is disabled until verification succeeds.',
          style: 'bg-red-50 border-red-200 text-red-800',
          action: 'verify'
        };
      case 'INVALID_AUTHORIZATION':
      case 'STORAGE_ERROR':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'Licensing Error',
          message: 'The local authorization could not be verified. Please contact support.',
          style: 'bg-red-50 border-red-200 text-red-800'
        };
      case 'ACTIVE':
        if (status.checkInState === 'REQUIRED') {
          return {
            icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
            title: 'Action Required: License Verification',
            message: 'Your POS must verify its license over the internet within the next 6 hours to continue billing.',
            style: 'bg-amber-50 border-amber-200 text-amber-800',
            action: 'verify'
          };
        } else if (status.checkInState === 'DUE_SOON') {
          return {
            icon: <AlertCircle className="h-5 w-5 text-blue-600" />,
            title: 'Internet Connection Needed Soon',
            message: 'Your POS needs to connect to the internet within the next 48 hours to maintain billing access.',
            style: 'bg-blue-50 border-blue-200 text-blue-800'
          };
        }
        return {
          icon: <AlertCircle className="h-5 w-5 text-gray-600" />,
          title: 'System Notice',
          message: '',
          style: 'bg-gray-50 border-gray-200 text-gray-800'
        };
      default:
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          title: 'Licensing Error',
          message: 'An unknown licensing error occurred.',
          style: 'bg-red-50 border-red-200 text-red-800'
        };
    }
  };

  const content = getBannerContent();

  return (
    <div className={`p-3 border-b flex items-center justify-between ${content.style}`}>
      <div className="flex items-center space-x-3">
        {content.icon}
        <div>
          <span className="font-semibold">{content.title}: </span>
          <span>{content.message}</span>
        </div>
      </div>
      {content.action === 'verify' && (
        <button
          onClick={verifyNow}
          className="px-4 py-1.5 bg-white bg-opacity-50 hover:bg-opacity-75 rounded-md font-medium text-sm transition-colors shadow-sm"
        >
          Verify Now
        </button>
      )}
    </div>
  );
};
