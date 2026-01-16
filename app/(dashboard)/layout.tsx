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
    <div className="min-h-screen min-w-[1440px] bg-background">
      <NavigationLoadingProvider>
        <Navbar />
        <main>{children}</main>
      </NavigationLoadingProvider>
    </div>
  )
}

