import './globals.css'

export const metadata = {
  title: 'StockReserve',
  description: 'Inventory Reservation System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}