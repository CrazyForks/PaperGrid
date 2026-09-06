'use client'

import Link from 'next/link'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Github, Mail } from 'lucide-react'

export function SignInForm({
  githubEnabled,
  googleEnabled,
}: {
  githubEnabled: boolean
  googleEnabled: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        if (result.code === 'rate_limited') {
          setError('尝试过于频繁，请稍后再试')
        } else {
          setError('邮箱或密码错误')
        }
      } else {
        router.push('/admin')
        router.refresh()
      }
    } catch (error) {
      setError('登录失败,请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="schale-signin">
      <div className="schale-signin-panel space-y-7">
        <Link href="/" className="text-primary text-sm">
          ← 返回博客
        </Link>
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
            欢迎回来
          </h1>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                邮箱
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                密码
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        {(githubEnabled || googleEnabled) && (
          <div className="space-y-3 border-t pt-6">
            <p className="text-muted-foreground mb-3 text-center text-sm">使用其他账号登录</p>
            {githubEnabled && (
              <button
                disabled={isLoading}
                onClick={() => signIn('github', { callbackUrl: '/' })}
                className="hover:bg-secondary flex w-full items-center justify-center gap-3 rounded-lg border p-3"
              >
                <Github size={18} />
                GitHub
              </button>
            )}
            {googleEnabled && (
              <button
                disabled={isLoading}
                onClick={() => signIn('google', { callbackUrl: '/' })}
                className="hover:bg-secondary flex w-full items-center justify-center gap-3 rounded-lg border p-3"
              >
                <Mail size={18} />
                Google
              </button>
            )}
          </div>
        )}
        <p className="text-muted-foreground text-center text-xs tracking-widest">
          PAPERGRID · 创作与记录
        </p>
      </div>
    </div>
  )
}
