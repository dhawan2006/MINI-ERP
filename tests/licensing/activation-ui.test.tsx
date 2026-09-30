/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ActivationScreen } from '../../src/presentation/components/licensing/ActivationScreen';
import { useLicensingStore } from '../../src/application/state/licensingStore';
import { LicensingBanner } from '../../src/presentation/components/licensing/LicensingBanner';
import { LicensingStatusDTO } from '../../src/shared/licensing-dto';

vi.mock('../../src/application/state/licensingStore', () => ({
  useLicensingStore: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="icon-alert-circle" />,
  Key: () => <div data-testid="icon-key" />,
  Loader2: () => <div data-testid="icon-loader2" />,
  ShieldCheck: () => <div data-testid="icon-shield-check" />,
  AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
}));

describe('Phase 9 — Activation UX & Licensing Banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ActivationScreen', () => {
    it('should render the activation screen and allow input', async () => {
      const activateMock = vi.fn().mockResolvedValue(undefined);
      
      (useLicensingStore as any).mockReturnValue({
        activate: activateMock,
        isActivating: false,
        activationError: null,
      });

      render(<ActivationScreen />);

      const title = screen.getByText('Activate Mini POS');
      expect(title).toBeDefined();

      const input = screen.getByLabelText(/License Key/i) as HTMLInputElement;
      expect(input).toBeDefined();

      fireEvent.change(input, { target: { value: 'test-key-123' } });
      expect(input.value).toBe('TEST-KEY-123'); // Uppercase forced by onChange

      const button = screen.getByRole('button', { name: /Activate Device/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(activateMock).toHaveBeenCalledWith('TEST-KEY-123');
      });
    });

    it('should display activation error', () => {
      (useLicensingStore as any).mockReturnValue({
        activate: vi.fn(),
        isActivating: false,
        activationError: 'The license key is invalid or not found.',
      });

      render(<ActivationScreen />);

      const errorAlert = screen.getByText('The license key is invalid or not found.');
      expect(errorAlert).toBeDefined();
    });
  });

  describe('LicensingBanner', () => {
    it('should not render if status is ACTIVE or NOT_ACTIVATED', () => {
      (useLicensingStore as any).mockReturnValue({
        status: { state: 'ACTIVE' },
      });
      const { container: containerActive } = render(<LicensingBanner />);
      expect(containerActive.firstChild).toBeNull();

      (useLicensingStore as any).mockReturnValue({
        status: { state: 'NOT_ACTIVATED' },
      });
      const { container: containerNotActivated } = render(<LicensingBanner />);
      expect(containerNotActivated.firstChild).toBeNull();
    });

    it('should render expired warning', () => {
      const validUntil = new Date().toISOString();
      (useLicensingStore as any).mockReturnValue({
        status: { state: 'EXPIRED', validUntil } as LicensingStatusDTO,
      });
      
      render(<LicensingBanner />);
      expect(screen.getByText(/License Expired/i)).toBeDefined();
      expect(screen.getByText(/Billing is disabled/i)).toBeDefined();
    });

    it('should render device mismatch warning', () => {
      (useLicensingStore as any).mockReturnValue({
        status: { state: 'DEVICE_MISMATCH' } as LicensingStatusDTO,
      });
      
      render(<LicensingBanner />);
      expect(screen.getByText(/Device Mismatch/i)).toBeDefined();
    });
    
    it('should render security error', () => {
      (useLicensingStore as any).mockReturnValue({
        status: { state: 'DEVICE_IDENTITY_UNAVAILABLE' } as LicensingStatusDTO,
      });
      
      render(<LicensingBanner />);
      expect(screen.getByText(/Security Error/i)).toBeDefined();
    });
  });
});
