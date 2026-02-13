'use client'

import { useToast } from '@/components/ui/toast-provider'

export default function TestSimplePage() {
  const isDev = process.env.NODE_ENV !== 'production'
  const toast = useToast()

  if (!isDev) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Not Found</h1>
      </div>
    )
  }

  const handleClick = () => {
    console.log('=== SIMPLE TEST CLICKED ===')
    toast.success('Test works!', 'Check console.')
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Simple Test Page</h1>
      <p className="mb-4">If this button works, React is working.</p>
      <button 
        onClick={handleClick}
        className="px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Click Me - Should Show Toast
      </button>
      <div className="mt-4">
        <a href="/login" className="text-blue-500 underline">Back to Login</a>
      </div>
    </div>
  )
}

