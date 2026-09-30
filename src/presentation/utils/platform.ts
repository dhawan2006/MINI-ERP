/**
 * Utility for determining the platform modifier key for shortcuts.
 * macOS uses Command (⌘), Windows/Linux use Ctrl.
 */
export function getModifierKey(): string {
  // Safe platform check
  const platform = typeof navigator !== 'undefined' 
    ? (navigator.platform || navigator.userAgent).toLowerCase() 
    : '';

  if (platform.includes('mac')) {
    return '⌘';
  }
  return 'Ctrl';
}
