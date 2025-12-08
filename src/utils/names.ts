import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from 'unique-names-generator';

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
