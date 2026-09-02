import bcrypt from 'bcryptjs'

// Cout 10 : identique a celui utilise par Supabase/GoTrue, pour que les hash
// migres depuis auth.users.encrypted_password restent verifiables sans reset force.
const SALT_ROUNDS = 10

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
