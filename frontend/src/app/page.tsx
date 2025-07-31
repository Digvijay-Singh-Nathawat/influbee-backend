'use client'

import { useAuthStore } from '@/lib/store/auth'
import { AuthForm } from '@/components/auth/auth-form'
import { Dashboard } from '@/components/dashboard/dashboard'
import { useEffect } from 'react'

export default function Home() {
  const { user, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Welcome to Agora Platform
            </h1>
            <p className="text-xl text-gray-600">
              Real-time monetized communication with video calls, voice calls, and chat
            </p>
          </div>
          <AuthForm />
        </div>
      </div>
    )
  }

  return <Dashboard />
} 