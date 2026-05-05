import './globals.css'
import { SpeedInsights } from "@vercel/speed-insights/next"

export const metadata = {
  title: 'StockReserve',
  description: 'Inventory Reservation System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}

       
        <SpeedInsights />
      </body>
    </html>
  )
}