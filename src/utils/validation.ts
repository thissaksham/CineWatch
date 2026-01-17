/**
 * Validation Utilities
 * Common validation functions for form inputs and data
 */

/**
 * Validates an email address
 */
export const isValidEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Password validation result with detailed feedback
 */
export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates a password with configurable requirements
 * Default: minimum 8 characters, at least one uppercase, one lowercase, one number
 */
export const validatePassword = (password: string, options?: {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecial?: boolean;
}): PasswordValidation => {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecial = false,
  } = options || {};

  const errors: string[] = [];

  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password is required'] };
  }

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters`);
  }

  if (requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Simple password validation (backwards compatible)
 * Returns true if password meets minimum requirements
 */
export const isValidPassword = (password: string): boolean => {
  return validatePassword(password, {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: false,
  }).isValid;
};

/**
 * Validates a date string
 */
export const isValidDate = (dateString: string): boolean => {
  if (!dateString || typeof dateString !== 'string') return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

/**
 * Validates a URL
 */
export const isValidUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Validates a TMDB ID (positive integer)
 */
export const isValidTmdbId = (id: unknown): id is number => {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
};

/**
 * Sanitizes a string by removing control characters
 */
export const sanitizeString = (str: string): string => {
  if (!str || typeof str !== 'string') return '';
  // Remove control characters except newlines and tabs
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
};

/**
 * Sanitizes search input for database queries
 * Removes control characters and limits length to prevent injection attacks
 * @param input - Raw search string from user
 * @param maxLength - Maximum allowed length (default: 200)
 * @returns Cleaned and truncated search string
 * @throws Error if input is not a string
 */
export function sanitizeSearchInput(input: string, maxLength: number = 200): string {
    if (typeof input !== 'string') {
        throw new Error('Search input must be a string');
    }
    
    // Remove control characters (0x00-0x1f, 0x7f) and normalize whitespace
    const cleaned = input
        .replace(/[\x00-\x1f\x7f]/g, '') // Remove control chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    return cleaned.slice(0, maxLength);
}

/**
 * Validates UUID v4 format
 * @param id - String to validate as UUID
 * @returns true if valid UUID v4, false otherwise
 */
export function validateUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}

/**
 * Sanitizes and validates TMDB ID
 * @param id - TMDB ID as number or string
 * @returns Valid TMDB ID as number
 * @throws Error if ID is invalid
 */
export function sanitizeTMDBId(id: number | string): number {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    
    if (!Number.isInteger(numId) || numId <= 0 || numId > 999999999) {
        throw new Error('Invalid TMDB ID');
    }
    
    return numId;
}

/**
 * Validates ISO 3166-1 alpha-2 country code
 * @param code - Two-letter country code
 * @returns true if valid ISO country code format, false otherwise
 */
export function validateRegionCode(code: string): boolean {
    // ISO 3166-1 alpha-2 country codes (2 uppercase letters)
    return /^[A-Z]{2}$/.test(code);
}
