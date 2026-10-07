const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derives a 32-byte key from string
 * @param {string} secret
 * @returns {Buffer}
 */
const getKey = (secret) => {
  return crypto.createHash('sha256').update(String(secret || 'default-secret-key-for-encryption-32bytes')).digest();
};

/**
 * Encrypts sensitive string (e.g. OAuth tokens)
 * @param {string} text
 * @returns {string} iv:tag:encrypted
 */
const encrypt = (text) => {
  if (!text) return null;
  const key = getKey(env.encryptionKey || env.jwt.secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
};

/**
 * Decrypts sensitive string
 * @param {string} encryptedText
 * @returns {string} plaintext
 */
const decrypt = (encryptedText) => {
  if (!encryptedText) return null;
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      // In case token was stored as plain text during initial testing/migration
      return encryptedText;
    }
    
    const [ivHex, tagHex, encryptedData] = parts;
    const key = getKey(env.encryptionKey || env.jwt.secret);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails (e.g. key changed or legacy format), return null or plain if not encrypted
    return null;
  }
};

/**
 * Safely masks a token for UI presentation
 * @param {string} token
 * @returns {string}
 */
const maskToken = (token) => {
  if (!token) return '';
  if (token.length <= 8) return '••••••••';
  return `${token.substring(0, 4)}••••${token.substring(token.length - 4)}`;
};

module.exports = {
  encrypt,
  decrypt,
  maskToken,
};
