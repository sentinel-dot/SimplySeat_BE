/**
 * Utility functions for email validation and spam protection
 */

/**
 * Common disposable/temporary email providers to block
 * Updated list of most common providers (not exhaustive)
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  // Popular temp mail services
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'guerrillamail.com',
  '10minutemail.com', 'mailinator.com', 'maildrop.cc', 'throwaway.email',
  'getnada.com', 'trashmail.com', 'sharklasers.com', 'guerrillamail.info',
  'grr.la', 'guerrillamail.biz', 'guerrillamail.de', 'spam4.me',
  'fakeinbox.com', 'yopmail.com', 'yopmail.fr', 'cool.fr.nf',
  'jetable.org', 'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj',
  'speed.1s.fr', 'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf',
  'monmail.fr.nf', 'hide.biz.st', 'mymail.infos.st',
  // More common ones
  'mailnesia.com', 'mailtothis.com', 'mintemail.com', 'mt2014.com',
  'discard.email', 'discardmail.com', 'spambog.com', 'binkmail.com',
  'safetymail.info', 'bugmenot.com', 'deadaddress.com', 'emailondeck.com',
  'fakeinbox.com', 'filzmail.com', 'getairmail.com', 'gishpuppy.com',
]);

/**
 * Check if email domain is from a disposable/temporary provider
 */
export function isDisposableEmail(email: string): boolean {
  try {
    const domain = email.toLowerCase().split('@')[1];
    if (!domain) return false;
    return DISPOSABLE_EMAIL_DOMAINS.has(domain);
  } catch {
    return false;
  }
}

/**
 * Check if text contains suspicious URLs (basic spam detection)
 * Allows legitimate links but catches obvious spam patterns
 */
export function containsSuspiciousUrls(text: string): boolean {
  // Check for http:// or https:// followed by domain
  const urlPattern = /https?:\/\/[^\s]+/gi;
  const matches = text.match(urlPattern);
  
  if (!matches) return false;
  
  // Allow 0-1 URLs (legitimate contact might include a reference link)
  // More than 1 URL is suspicious in a contact form
  return matches.length > 1;
}

/**
 * Check if text contains common spam keywords
 */
export function containsSpamKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  const spamKeywords = [
    'click here now',
    'buy now',
    'limited time offer',
    'act now',
    'make money fast',
    'work from home',
    'free money',
    'prize winner',
    'congratulations you won',
    'nigerian prince',
    'viagra',
    'cialis',
    'casino',
    'lottery',
    'bitcoin investment',
    'crypto investment',
  ];
  
  return spamKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * Comprehensive spam check for contact form
 */
export function isLikelySpam(email: string, message: string): { isSpam: boolean; reason?: string } {
  if (isDisposableEmail(email)) {
    return { isSpam: true, reason: 'Temporäre E-Mail-Adressen sind nicht erlaubt' };
  }
  
  if (containsSuspiciousUrls(message)) {
    return { isSpam: true, reason: 'Zu viele Links in der Nachricht' };
  }
  
  if (containsSpamKeywords(message)) {
    return { isSpam: true, reason: 'Nachricht enthält verdächtige Inhalte' };
  }
  
  return { isSpam: false };
}
