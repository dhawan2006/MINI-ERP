export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}



export class InvalidProductError extends DomainError {}
export class InactiveProductError extends DomainError {}
export class InvalidQuantityError extends DomainError {}
export class EmptyBillError extends DomainError {}
export class InvalidBillStateError extends DomainError {}
export class InvalidPriceError extends DomainError {}
export class ProductNotFoundError extends DomainError {}
export class DuplicateBarcodeError extends DomainError {}
export class ProductUpdateFailedError extends DomainError {}

