import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getMasterKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'deployforge_dev_secret_key_fallback_at_least_32_characters'
  // Derive a consistent 32-byte key using SHA-256
  return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encrypt sensitive plaintext string using AES-256-GCM.
 * Output format: <ivHex>:<authTagHex>:<cipherHex>
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return ''
  const masterKey = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH })

  let encrypted = cipher.update(plainText, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt token ciphertext string formatted as <ivHex>:<authTagHex>:<cipherHex>.
 */
export function decryptToken(cipherString: string): string {
  if (!cipherString) return ''
  const parts = cipherString.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format')
  }

  const [ivHex, authTagHex, encryptedHex] = parts
  const masterKey = getMasterKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export const encryptSecret = encryptToken
export const decryptSecret = decryptToken
