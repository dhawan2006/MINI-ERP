export function validateString(value: any, name: string): void {
  if (typeof value !== 'string') {
    throw new TypeError(`Invalid ${name}: expected string, got ${typeof value}`);
  }
}

export function validateNonEmptyString(value: any, name: string): void {
  validateString(value, name);
  if (value.trim() === '') {
    throw new Error(`Invalid ${name}: cannot be empty`);
  }
}

export function validatePositiveInteger(value: any, name: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`Invalid ${name}: expected positive integer, got ${value}`);
  }
}

export function validateNonNegativeInteger(value: any, name: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`Invalid ${name}: expected non-negative integer, got ${value}`);
  }
}

export function validateNumber(value: any, name: string): void {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError(`Invalid ${name}: expected finite number, got ${value}`);
  }
}

export function validateBoolean(value: any, name: string): void {
  if (typeof value !== 'boolean') {
    throw new TypeError(`Invalid ${name}: expected boolean, got ${typeof value}`);
  }
}

export function validateObject(value: any, name: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`Invalid ${name}: expected object, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`);
  }
}
