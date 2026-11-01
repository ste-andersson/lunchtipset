import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react'
import { createContext, type ReactNode, useContext, useMemo } from 'react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

export interface AppAuth {
  /** False when Clerk isn't configured; the app then runs in guest mode only. */
  enabled: boolean
  isLoaded: boolean
  userId: string | null
  firstName: string | null
  getToken: () => Promise<string | null>
  signIn: () => void
  signOut: () => void
  openProfile: () => void
}

const guest: AppAuth = {
  enabled: false,
  isLoaded: true,
  userId: null,
  firstName: null,
  getToken: async () => null,
  signIn: () => {},
  signOut: () => {},
  openProfile: () => {},
}

const AuthContext = createContext<AppAuth>(guest)
export const useAppAuth = () => useContext(AuthContext)

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, userId, getToken } = useAuth()
  const clerk = useClerk()
  const { user } = useUser()
  const firstName = user?.firstName ?? null
  const value = useMemo<AppAuth>(
    () => ({
      enabled: true,
      isLoaded,
      userId: userId ?? null,
      firstName,
      getToken: () => getToken(),
      signIn: () => clerk.openSignIn(),
      signOut: () => void clerk.signOut(),
      openProfile: () => clerk.openUserProfile(),
    }),
    [isLoaded, userId, firstName, getToken, clerk],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!PUBLISHABLE_KEY) return <AuthContext.Provider value={guest}>{children}</AuthContext.Provider>
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  )
}
