import './globals.css'

export const metadata = {
  title: 'StockReserve - Inventory Reservation System',
  description: 'Inventory system',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}