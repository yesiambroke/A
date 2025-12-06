/**
 * Rate limiting for chat messages
 * Tracks message counts per user with sliding window
 */
class RateLimiter {
  constructor(maxMessages = 5, windowMs = 60000) { // 5 messages per minute
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;
    this.userMessages = new Map(); // wallet_address -> array of timestamps
  }

  /**
   * Check if user can send a message (rate limit check)
   * @param {string} walletAddress - User's wallet address
   * @returns {boolean} - True if user can send message
   */
  canSendMessage(walletAddress) {
    const now = Date.now();
    const userHistory = this.userMessages.get(walletAddress) || [];
    
    // Remove old messages outside the window
    const recentMessages = userHistory.filter(timestamp => 
      now - timestamp < this.windowMs
    );
    
    // Update user history
    this.userMessages.set(walletAddress, recentMessages);
    
    // Check if under limit
    return recentMessages.length < this.maxMessages;
  }

  /**
   * Record a message sent by user
   * @param {string} walletAddress - User's wallet address
   */
  recordMessage(walletAddress) {
    const now = Date.now();
    const userHistory = this.userMessages.get(walletAddress) || [];
    userHistory.push(now);
    this.userMessages.set(walletAddress, userHistory);
  }

  /**
   * Get remaining messages for user
   * @param {string} walletAddress - User's wallet address
   * @returns {number} - Number of messages user can still send
   */
  getRemainingMessages(walletAddress) {
    const now = Date.now();
    const userHistory = this.userMessages.get(walletAddress) || [];
    const recentMessages = userHistory.filter(timestamp => 
      now - timestamp < this.windowMs
    );
    return Math.max(0, this.maxMessages - recentMessages.length);
  }
}

/**
 * Simple profanity filter
 */
class ProfanityFilter {
  constructor() {
    // Basic profanity word list (can be expanded)
    this.bannedWords = [
      'spam', 'scam', 'rug', 'dump', 'pump',
      // Add more words as needed
    ];
    
    // Convert to lowercase for case-insensitive matching
    this.bannedWordsLower = this.bannedWords.map(word => word.toLowerCase());
  }

  /**
   * Check if message contains banned words
   * @param {string} message - Message to check
   * @returns {boolean} - True if message is clean
   */
  isMessageClean(message) {
    const messageLower = message.toLowerCase();
    
    // Check for banned words
    for (const word of this.bannedWordsLower) {
      if (messageLower.includes(word)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Clean message by replacing banned words with asterisks
   * @param {string} message - Original message
   * @returns {string} - Cleaned message
   */
  cleanMessage(message) {
    let cleaned = message;
    
    for (const word of this.bannedWords) {
      const regex = new RegExp(word, 'gi');
      cleaned = cleaned.replace(regex, '*'.repeat(word.length));
    }
    
    return cleaned;
  }
}

/**
 * User moderation manager
 */
class ModerationManager {
  constructor(dbQuery) {
    this.dbQuery = dbQuery;
    this.rateLimiter = new RateLimiter();
    this.profanityFilter = new ProfanityFilter();
  }

  /**
   * Check if user is banned
   * @param {string} walletAddress - User's wallet address
   * @returns {Promise<boolean>} - True if user is banned
   */
  async isUserBanned(walletAddress) {
    try {
      const result = await this.dbQuery(
        'SELECT is_banned FROM users WHERE wallet_address = $1',
        [walletAddress]
      );
      
      return result.rows.length > 0 && result.rows[0].is_banned;
    } catch (error) {
      console.error('Error checking ban status:', error);
      return false; // Default to not banned if DB error
    }
  }

  /**
   * Check if user is moderator
   * @param {string} walletAddress - User's wallet address
   * @returns {Promise<boolean>} - True if user is moderator
   */
  async isUserModerator(walletAddress) {
    try {
      const result = await this.dbQuery(
        'SELECT is_moderator FROM users WHERE wallet_address = $1',
        [walletAddress]
      );
      
      return result.rows.length > 0 && result.rows[0].is_moderator;
    } catch (error) {
      console.error('Error checking moderator status:', error);
      return false;
    }
  }

  /**
   * Ban a user
   * @param {string} moderatorWallet - Moderator's wallet address
   * @param {string} targetWallet - Target user's wallet address
   * @param {string} reason - Reason for ban
   * @returns {Promise<boolean>} - True if ban was successful
   */
  async banUser(moderatorWallet, targetWallet, reason = 'No reason provided') {
    try {
      // Check if moderator has permission
      const isMod = await this.isUserModerator(moderatorWallet);
      if (!isMod) {
        return false;
      }

      // Ban the user
      await this.dbQuery(
        'UPDATE users SET is_banned = TRUE WHERE wallet_address = $1',
        [targetWallet]
      );

      // Log the action
      await this.dbQuery(
        'INSERT INTO moderation_logs (moderator_wallet, target_wallet, action, reason) VALUES ($1, $2, $3, $4)',
        [moderatorWallet, targetWallet, 'ban', reason]
      );

      return true;
    } catch (error) {
      console.error('Error banning user:', error);
      return false;
    }
  }

  /**
   * Unban a user
   * @param {string} moderatorWallet - Moderator's wallet address
   * @param {string} targetWallet - Target user's wallet address
   * @param {string} reason - Reason for unban
   * @returns {Promise<boolean>} - True if unban was successful
   */
  async unbanUser(moderatorWallet, targetWallet, reason = 'No reason provided') {
    try {
      // Check if moderator has permission
      const isMod = await this.isUserModerator(moderatorWallet);
      if (!isMod) {
        return false;
      }

      // Unban the user
      await this.dbQuery(
        'UPDATE users SET is_banned = FALSE WHERE wallet_address = $1',
        [targetWallet]
      );

      // Log the action
      await this.dbQuery(
        'INSERT INTO moderation_logs (moderator_wallet, target_wallet, action, reason) VALUES ($1, $2, $3, $4)',
        [moderatorWallet, targetWallet, 'unban', reason]
      );

      return true;
    } catch (error) {
      console.error('Error unbanning user:', error);
      return false;
    }
  }

  /**
   * Sanitize message content to prevent XSS and injection attacks
   * @param {string} message - Raw message content
   * @returns {string} - Sanitized message
   */
  sanitizeMessage(message) {
    if (typeof message !== 'string') {
      return '';
    }

    // Remove HTML tags and entities
    let sanitized = message
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[^;]+;/g, '') // Remove HTML entities
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:/gi, '') // Remove data: protocol
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
      .replace(/\x00/g, '') // Remove null bytes
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters

    // Normalize whitespace
    sanitized = sanitized
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing whitespace

    return sanitized;
  }

  /**
   * Validate a message before broadcasting
   * @param {string} walletAddress - Sender's wallet address
   * @param {string} message - Message content
   * @returns {Promise<{allowed: boolean, reason?: string, sanitizedMessage?: string}>}
   */
  async validateMessage(walletAddress, message) {
    // Check if user is banned
    const isBanned = await this.isUserBanned(walletAddress);
    if (isBanned) {
      return { allowed: false, reason: 'User is banned' };
    }

    // Check rate limit
    if (!this.rateLimiter.canSendMessage(walletAddress)) {
      const remaining = this.rateLimiter.getRemainingMessages(walletAddress);
      return { 
        allowed: false, 
        reason: `Rate limit exceeded. Try again in a minute. (${remaining} messages remaining)` 
      };
    }

    // Sanitize the message first
    const sanitizedMessage = this.sanitizeMessage(message);

    // Check message length (after sanitization)
    if (sanitizedMessage.length > 120) {
      return { allowed: false, reason: 'Message too long (max 120 characters)' };
    }

    if (sanitizedMessage.length === 0) {
      return { allowed: false, reason: 'Message cannot be empty' };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\b(eval|exec|system|shell_exec|passthru)\s*\(/i,
      /\b(script|iframe|object|embed|form)\b/i,
      /\b(drop|delete|insert|update|select)\s+/i, // Basic SQL injection patterns
      /[<>'"&]/g, // Remaining HTML characters after sanitization
      /\$\{|\$\(/g, // Template injection patterns
      /\\\\/g // Excessive backslashes
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(sanitizedMessage)) {
        return { allowed: false, reason: 'Message contains suspicious content' };
      }
    }

    // Check profanity on sanitized message
    if (!this.profanityFilter.isMessageClean(sanitizedMessage)) {
      return { allowed: false, reason: 'Message contains inappropriate content' };
    }

    return { allowed: true, sanitizedMessage };
  }

  /**
   * Record a successful message send
   * @param {string} walletAddress - Sender's wallet address
   */
  recordMessageSent(walletAddress) {
    this.rateLimiter.recordMessage(walletAddress);
  }
}

module.exports = {
  RateLimiter,
  ProfanityFilter,
  ModerationManager
};
