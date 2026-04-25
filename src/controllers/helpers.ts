// ============================================================
// Shared controller helper — extract validation error messages
// ============================================================
import { Result, ValidationError } from 'express-validator';

export function extractErrors(result: Result<ValidationError>): string[] {
  return result.array().map((e) => (typeof e.msg === 'string' ? e.msg : JSON.stringify(e.msg)));
}
