/**
 * Cryptographic utilities for PII encryption (DSGVO/GDPR compliance)
 * Uses AES-256-GCM for authenticated encryption.
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM
const TAG_LENGTH = 128 // bits

/**
 * Derives a CryptoKey from the encryption secret.
 * Uses PBKDF2 for key derivation.
 */
async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns base64-encoded string: salt (16 bytes) + iv (12 bytes) + ciphertext + tag
 */
export async function encrypt(plaintext: string, encryptionKey: string): Promise<string> {
  if (!plaintext) return ''
  
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  
  const key = await deriveKey(encryptionKey, salt)
  
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv,
      tagLength: TAG_LENGTH,
    },
    key,
    encoder.encode(plaintext)
  )

  // Combine salt + iv + ciphertext into single buffer
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)

  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypts ciphertext encrypted with encrypt().
 */
export async function decrypt(encryptedData: string, encryptionKey: string): Promise<string> {
  if (!encryptedData) return ''
  
  const decoder = new TextDecoder()
  const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0))

  const salt = combined.slice(0, 16)
  const iv = combined.slice(16, 16 + IV_LENGTH)
  const ciphertext = combined.slice(16 + IV_LENGTH)

  const key = await deriveKey(encryptionKey, salt)

  const plaintext = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv,
      tagLength: TAG_LENGTH,
    },
    key,
    ciphertext
  )

  return decoder.decode(plaintext)
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)

  if (aBytes.length !== bBytes.length) {
    // Compare with itself to maintain constant time
    await crypto.subtle.digest('SHA-256', aBytes)
    return false
  }

  const aHash = await crypto.subtle.digest('SHA-256', aBytes)
  const bHash = await crypto.subtle.digest('SHA-256', bBytes)

  const aArray = new Uint8Array(aHash)
  const bArray = new Uint8Array(bHash)

  let result = 0
  for (let i = 0; i < aArray.length; i++) {
    result |= aArray[i] ^ bArray[i]
  }

  return result === 0
}

/**
 * Hash a value for indexing (allows searching encrypted data).
 * Uses SHA-256 with a pepper for added security.
 */
export async function hashForIndex(value: string, pepper: string): Promise<string> {
  if (!value) return ''
  
  const encoder = new TextEncoder()
  const data = encoder.encode(value.toLowerCase() + pepper)
  const hash = await crypto.subtle.digest('SHA-256', data)
  
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
}

/**
 * PII field names that should be encrypted in orders.
 */
export const PII_FIELDS = [
  'email',
  'customer_name',
  'shipping_name',
  'shipping_address_line1',
  'shipping_address_line2',
  'shipping_city',
  'shipping_state',
  'shipping_postal_code',
  'shipping_country',
] as const

export type PIIField = typeof PII_FIELDS[number]

/**
 * Encrypts all PII fields in an object.
 */
export async function encryptPII<T extends Partial<Record<PIIField, string | null>>>(
  data: T,
  encryptionKey: string
): Promise<T> {
  const encrypted = { ...data }
  
  for (const field of PII_FIELDS) {
    const value = encrypted[field as keyof T]
    if (typeof value === 'string' && value) {
      (encrypted as any)[field] = await encrypt(value, encryptionKey)
    }
  }
  
  return encrypted
}

/**
 * Decrypts all PII fields in an object.
 */
export async function decryptPII<T extends Partial<Record<PIIField, string | null>>>(
  data: T,
  encryptionKey: string
): Promise<T> {
  const decrypted = { ...data }
  
  for (const field of PII_FIELDS) {
    const value = decrypted[field as keyof T]
    if (typeof value === 'string' && value) {
      try {
        (decrypted as any)[field] = await decrypt(value, encryptionKey)
      } catch {
        // If decryption fails, field might not be encrypted (legacy data)
        // Keep original value
      }
    }
  }
  
  return decrypted
}
