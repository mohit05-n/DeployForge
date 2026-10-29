import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/hooks/useAuth'

export const metadata: Metadata = {
  title: {
    default: 'DeployForge — Self-Service Cloud Deployment',
    template: '%s | DeployForge',
  },
  description: 'Deploy, monitor, and secure your applications on AWS with DeployForge — the developer-first cloud deployment platform.',
  keywords: ['deployment', 'cloud', 'AWS', 'Docker', 'DevOps', 'CI/CD', 'Kubernetes'],
  authors: [{ name: 'DeployForge Team' }],
  openGraph: {
    type: 'website',
    title: 'DeployForge',
    description: 'Self-service cloud deployment platform for developers',
    siteName: 'DeployForge',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
