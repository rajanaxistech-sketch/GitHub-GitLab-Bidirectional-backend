const { encrypt, decrypt, maskToken } = require('../src/utils/crypto.util');

describe('Crypto Utility', () => {
  it('should encrypt and decrypt a sensitive token accurately', () => {
    const originalToken = 'ghp_secretTokenForGitHub1234567890';
    const encrypted = encrypt(originalToken);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(originalToken);
    expect(encrypted.split(':').length).toBe(3); // iv:tag:ciphertext

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it('should return null when decrypting empty or invalid input', () => {
    expect(decrypt(null)).toBeNull();
    expect(decrypt('')).toBeNull();
  });

  it('should mask tokens safely for display', () => {
    expect(maskToken('ghp_1234567890abcdef')).toBe('ghp_••••cdef');
    expect(maskToken('short')).toBe('••••••••');
    expect(maskToken('')).toBe('');
  });
});
