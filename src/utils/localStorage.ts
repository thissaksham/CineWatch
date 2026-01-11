/**
 * LocalStorage Utilities
 * Safe wrappers for localStorage operations with error handling
 */

/**
 * Safely parse JSON from localStorage
 * Returns defaultValue if parsing fails or key doesn't exist
 */
export function getLocalStorageItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }

    const parsed = JSON.parse(item);
    
    // Basic type validation for arrays
    if (Array.isArray(defaultValue) && !Array.isArray(parsed)) {
      console.warn(`[LocalStorage] Expected array for key "${key}", got ${typeof parsed}. Returning default.`);
      return defaultValue;
    }

    return parsed as T;
  } catch (error) {
    console.error(`[LocalStorage] Failed to parse key "${key}":`, error);
    // Optionally clear corrupted data
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore removal errors
    }
    return defaultValue;
  }
}

/**
 * Safely set JSON in localStorage
 * Returns false if operation fails
 */
export function setLocalStorageItem<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    console.error(`[LocalStorage] Failed to set key "${key}":`, error);
    
    // Handle quota exceeded
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('[LocalStorage] Storage quota exceeded. Consider clearing old data.');
    }
    
    return false;
  }
}

/**
 * Safely remove item from localStorage
 */
export function removeLocalStorageItem(key: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[LocalStorage] Failed to remove key "${key}":`, error);
    return false;
  }
}

/**
 * Clear all Supabase-related keys from localStorage
 * Useful for logout/session cleanup
 */
export function clearSupabaseStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const keysToRemove = Object.keys(localStorage).filter(key => key.startsWith('sb-'));
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.error('[LocalStorage] Failed to clear Supabase storage:', error);
  }
}
