/**
 * Server-Side Credential Format Validator & Leak Guard
 * Validates API Key ID and Private Key inputs, rejecting empty or malformed values
 * while guaranteeing zero leakage of sensitive inputs in returned error messages.
 */

export interface CredentialValidationResult {
  valid: boolean;
  error?: string;
  code?: 'VALID' | 'CREDENTIALS_MISSING' | 'INVALID_TYPE' | 'INVALID_KEY_ID_FORMAT' | 'INVALID_PRIVATE_KEY_FORMAT';
}

/**
 * Validates API Key ID and Private Key formatting securely without echoing secret inputs.
 */
export function validateCredentialsFormat(
  apiKeyId: unknown,
  apiPrivateKey: unknown
): CredentialValidationResult {
  // Check for missing/null/undefined
  if (
    apiKeyId === undefined ||
    apiKeyId === null ||
    apiPrivateKey === undefined ||
    apiPrivateKey === null
  ) {
    return {
      valid: false,
      error: 'Missing Polyester API credentials: API Key ID and Private Key are required.',
      code: 'CREDENTIALS_MISSING',
    };
  }

  // Check types
  if (typeof apiKeyId !== 'string' || typeof apiPrivateKey !== 'string') {
    return {
      valid: false,
      error: 'Invalid credential types: API Key ID and Private Key must be non-empty strings.',
      code: 'INVALID_TYPE',
    };
  }

  // Sanitize whitespace and newlines
  const cleanKeyId = apiKeyId.replace(/[\r\n]+/g, '').trim();
  const cleanPrivateKey = apiPrivateKey.replace(/[\r\n]+/g, '').trim();

  // Check empty after trimming
  if (!cleanKeyId || !cleanPrivateKey) {
    return {
      valid: false,
      error: 'Missing Polyester API credentials: API Key ID and Private Key cannot be empty or whitespace.',
      code: 'CREDENTIALS_MISSING',
    };
  }

  // Length checks against minimum length criteria
  if (cleanKeyId.length < 4) {
    return {
      valid: false,
      error: 'Invalid API Key ID format: Key identifier must be at least 4 characters.',
      code: 'INVALID_KEY_ID_FORMAT',
    };
  }

  if (cleanPrivateKey.length < 8) {
    return {
      valid: false,
      error: 'Invalid Private Key format: Secret key must be at least 8 characters.',
      code: 'INVALID_PRIVATE_KEY_FORMAT',
    };
  }

  return {
    valid: true,
    code: 'VALID',
  };
}
