export class DatabaseLock {
  private static locked = false;

  static acquire() {
    this.locked = true;
  }

  static release() {
    this.locked = false;
  }

  static check() {
    if (this.locked) {
      const err = new Error('Database is locked for restoration');
      (err as any).code = 'RESTORE_IN_PROGRESS';
      throw err;
    }
  }

  static isLocked() {
    return this.locked;
  }
}
