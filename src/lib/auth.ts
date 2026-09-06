import NextAuth, { CredentialsSignin } from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from './prisma'
import { getSetting } from './settings'
import bcrypt from 'bcryptjs'
import { getClientIp, rateLimitLogin } from './rate-limit'
import { sessionStamp } from './session-stamp'

class RateLimitError extends CredentialsSignin {
  code = 'rate_limited'
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: '邮箱', type: 'email' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials, request) {
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string' ||
            credentials.email.length > 254 || Buffer.byteLength(credentials.password) > 72) {
          return null
        }

        const clientIp = request ? getClientIp(request) : 'unknown'
        if (!rateLimitLogin(clientIp, credentials.email).ok) {
          throw new RateLimitError()
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim() },
        })

        if (!user || !user.password) {
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async signIn({ user }) {
      const allowRegistration = (await getSetting<boolean>('auth.allowRegistration', true)) ?? true

      if (!allowRegistration) {
        const email = user?.email
        if (!email) return false
        const existingUser = await prisma.user.findUnique({ where: { email } })
        if (!existingUser) return false
      }

      return true
    },
    async jwt({ token, user }) {
      const id = user?.id || (typeof token.id === 'string' ? token.id : undefined)
      if (!id) return null
      const current = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, password: true, role: true, sessionVersion: true, name: true, image: true },
      })
      if (!current) return null
      const stamp = sessionStamp(current)
      if (!user && token.stamp !== stamp) return null
      token.id = current.id
      token.role = current.role
      token.stamp = stamp
      token.name = current.name
      token.email = current.email
      token.picture = current.image
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as 'USER' | 'ADMIN'
      }
      return session
    },
  },
})
