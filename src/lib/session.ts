import type { User } from '@prisma/client'
import { signAccessToken } from './jwt.js'
import { issueRefreshToken } from './refresh-tokens.js'

export function publicUser(user: Pick<User, 'avatarUrl' | 'email' | 'fullName' | 'id' | 'username'>) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    username: user.username,
    avatar_url: user.avatarUrl,
  }
}

export async function issueSession(userId: string) {
  const accessToken = signAccessToken(userId)
  const { token: refreshToken } = await issueRefreshToken(userId)
  return { access_token: accessToken, refresh_token: refreshToken }
}
