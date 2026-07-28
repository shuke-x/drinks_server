export enum ErrorCode {
  SUCCESS = 0,
  VALIDATION = 1400,
  NOT_FOUND = 1404,
  CONFLICT = 1409,
  INTERNAL = 1500,
}
export class BusinessException extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
