import type { Metadata } from 'next'
import React from 'react'
import '../src/index.css'

export const metadata: Metadata = {
  title: 'BIO Bridge',
  description: 'Wormhole Bridge UI for BIO, GROW, and QBIO tokens',
  viewport: 'width=device-width, initial-scale=1.0',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
} 