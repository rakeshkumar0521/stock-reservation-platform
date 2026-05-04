/* app/layout.jsx */
import './globals.css'

export const metadata = {
  title: 'StockReserve - Inventory Reservation System',
  description:
    'A production-ready inventory reservation system that prevents overselling with concurrent-safe stock reservations.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  )
}