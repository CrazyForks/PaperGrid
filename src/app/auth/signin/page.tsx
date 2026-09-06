import { SignInForm } from '@/components/auth/signin-form'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '登录',
  robots: {
    index: false,
    follow: false,
  },
}

export default function SignInPage() {
  return <SignInForm githubEnabled={Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)} googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
}
