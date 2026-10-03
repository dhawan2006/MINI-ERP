export type RuntimeCheckInStatus = 
  | 'NOT_APPLICABLE' // No policy V1 active, or legacy license
  | 'CURRENT'        // > 48 hours remaining
  | 'DUE_SOON'       // <= 48 hours remaining
  | 'REQUIRED'       // <= 6 hours remaining
  | 'EXPIRED';       // past checkInValidUntil

export class RuntimeCheckInStateCalculator {
  static calculateStatus(
    isPolicyV1: boolean,
    checkInValidUntil: string | undefined,
    nowTime: number
  ): RuntimeCheckInStatus {
    if (!isPolicyV1) {
      return 'NOT_APPLICABLE';
    }
    
    if (!checkInValidUntil) {
      // Policy V1 active but no receipt exists -> Check-in is immediately required/expired
      return 'EXPIRED';
    }
    
    const validUntilMs = new Date(checkInValidUntil).getTime();
    if (isNaN(validUntilMs)) return 'EXPIRED';

    const remainingMs = validUntilMs - nowTime;

    if (remainingMs <= 0) {
      return 'EXPIRED';
    }

    const hoursRemaining = remainingMs / (1000 * 60 * 60);

    if (hoursRemaining <= 6) {
      return 'REQUIRED';
    }

    if (hoursRemaining <= 48) {
      return 'DUE_SOON';
    }

    return 'CURRENT';
  }
}
