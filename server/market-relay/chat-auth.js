const { PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl');

/**
 * Verify a Solana wallet signature for chat authentication
 * @param {string} walletAddress - Base58 encoded wallet address
 * @param {string} message - Original message that was signed
 * @param {string} signedMessage - Base64 encoded signature
 * @returns {boolean} - True if signature is valid
 */
function verifyWalletSignature(walletAddress, message, signedMessage) {
  try {
    // Validate wallet address format
    const publicKey = new PublicKey(walletAddress);
    
    // Convert message to bytes
    const messageBytes = new TextEncoder().encode(message);
    
    // Convert signature from base64 to bytes
    const signatureBytes = Buffer.from(signedMessage, 'base64');
    
    // Verify signature
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
    
    return isValid;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a chat authentication message with timestamp
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} - Message to be signed by wallet
 */
function generateAuthMessage(timestamp) {
  return `M64 Chat Access - ${timestamp}`;
}

/**
 * Validate authentication message timestamp (must be within 5 minutes)
 * @param {string} message - The authentication message
 * @returns {boolean} - True if timestamp is valid
 */
function validateAuthTimestamp(message) {
  try {
    const timestampMatch = message.match(/M64 Chat Access - (\d+)/);
    if (!timestampMatch) return false;
    
    const timestamp = parseInt(timestampMatch[1]);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    // Check if timestamp is within 5 minutes (past or future)
    return Math.abs(now - timestamp) <= fiveMinutes;
  } catch (error) {
    console.error('Timestamp validation error:', error);
    return false;
  }
}

/**
 * Create a truncated username from wallet address
 * @param {string} walletAddress - Full wallet address
 * @returns {string} - Truncated username (first 4 + last 4 chars)
 */
function createUsername(walletAddress) {
  if (!walletAddress || walletAddress.length < 8) {
    return 'Unknown';
  }
  return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
}

module.exports = {
  verifyWalletSignature,
  generateAuthMessage,
  validateAuthTimestamp,
  createUsername
};
