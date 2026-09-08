'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { type ThemeProviderProps } from 'next-themes'

export function ThemeProvider({ children, scriptProps, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      {...props}
      // 主题必须在首次绘制前应用，避免被 Cloudflare Rocket Loader 延后。
      scriptProps={{ ...scriptProps, 'data-cfasync': 'false' }}
    >
      {children}
    </NextThemesProvider>
  )
}
