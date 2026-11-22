import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
const key = 'vr-theme'
const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void }>({ theme: 'light', setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved === 'dark' || saved === 'light') return saved
    } catch {
      // Appearance still works when storage is blocked.
    }
    return 'light'
  })

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem(key, theme) } catch { /* Storage is optional. */ }
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
