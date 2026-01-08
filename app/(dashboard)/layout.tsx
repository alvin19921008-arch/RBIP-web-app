import { requireAuth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { NavigationLoadingProvider } from '@/components/ui/navigation-loading'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuth()

  return (
    <div className="min-h-screen">
      <NavigationLoadingProvider navbarHeightPx={64}>
        <Navbar />
        <main>{children}</main>
      </NavigationLoadingProvider>
    </div>
  )
}

