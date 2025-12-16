import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from 'unique-names-generator';

// LocalStorage key for persistent username
const USERNAME_STORAGE_KEY = 'localwatch-username';

// Name validation rules
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 20;
const NAME_PATTERN = /^[a-zA-Z0-9\s]+$/; // Letters, numbers, spaces only

export interface NameValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Generate a random, friendly nickname for users
 */
export function generateNickname(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: '',
    style: 'capital',
    length: 2,
  });
}

/**
 * Validate a username
 */
export function validateName(name: string): NameValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, error: 'Name cannot be empty' };
  }

  if (trimmed.length < NAME_MIN_LENGTH) {
    return { valid: false, error: `Name must be at least ${NAME_MIN_LENGTH} characters` };
  }

  if (trimmed.length > NAME_MAX_LENGTH) {
    return { valid: false, error: `Name cannot exceed ${NAME_MAX_LENGTH} characters` };
  }

  if (!NAME_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Name can only contain letters, numbers, and spaces' };
  }

  // Check for leading/trailing spaces (after trimmed check, so internal spaces are ok)
  if (name !== trimmed) {
    return { valid: false, error: 'Name cannot have leading or trailing spaces' };
  }

  return { valid: true };
}

/**
 * Get saved username from localStorage
 */
export function getSavedUsername(): string | null {
  try {
    return localStorage.getItem(USERNAME_STORAGE_KEY);
  } catch (e) {
    console.error('Error reading saved username:', e);
    return null;
  }
}

/**
 * Save username to localStorage
 */
export function saveUsername(name: string): boolean {
  const validation = validateName(name);
  if (!validation.valid) {
    console.error('Invalid username:', validation.error);
    return false;
  }

  try {
    localStorage.setItem(USERNAME_STORAGE_KEY, name.trim());
    return true;
  } catch (e) {
    console.error('Error saving username:', e);
    return false;
  }
}

/**
 * Check if user has a saved username
 */
export function hasSavedUsername(): boolean {
  return getSavedUsername() !== null;
}

/**
 * Clear saved username
 */
export function clearSavedUsername(): void {
  try {
    localStorage.removeItem(USERNAME_STORAGE_KEY);
  } catch (e) {
    console.error('Error clearing saved username:', e);
  }
}

/**
 * Generate a random avatar color based on nickname
 */
export function getAvatarColor(nickname: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
  ];

  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get initials from nickname (first 2 chars)
 */
export function getInitials(nickname: string): string {
  return nickname.slice(0, 2).toUpperCase();
}
