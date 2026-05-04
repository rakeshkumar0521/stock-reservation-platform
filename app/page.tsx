'use client'
import './globals-loader.js'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Toaster, toast } from 'sonner'

// --- Types ------------------------------------

interface InventoryItem {
  warehouseId: string
  warehouseName: string
  warehouseLocation: string
  totalStock: number
  reservedStock: number
  availableStock: number
}

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  category: string | null
  emoji: string | null
  totalAvailable: number
  inventory: InventoryItem[]
}

interface Reservation {
  id: string
  productId: string
  productName: string
  productEmoji: string
  warehouseId: string
  warehouseName: string
  quantity: number
  status: string
  expiresAt: string
  createdAt: string
  confirmedAt: string | null
  releasedAt: string | null
  releaseReason: string | null
}

interface ReserveDialogState {
  open: boolean
  product: Product | null
  warehouseId: string
  quantity: number
}

// --- Helpers ----------------------------------

const formatPrice = (price: number): string => `$${price.toLocaleString()}`

const formatTimeRemaining = (
  expiresAt: string
): { text: string; seconds: number; percent: number } => {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return { text: 'Expired', seconds: 0, percent: 0 }
  const minutes = Math.floor(diff / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  const totalSeconds = Math.floor(diff / 1000)
  return {
    text: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    seconds: totalSeconds,
    percent: Math.min((totalSeconds / 600) * 100, 100),
  }
}

// --- Sub-components ---------------------------

const StockIndicator = ({ available, total }: { available: number; total: number }) => {
  const ratio = total > 0 ? available / total : 0
  let color = 'bg-green-500'
  let textColor = 'text-green-700'
  let bgColor = 'bg-green-50'
  if (ratio <= 0) {
    color = 'bg-red-500'; textColor = 'text-red-700'; bgColor = 'bg-red-50'
  } else if (ratio <= 0.3) {
    color = 'bg-orange-500'; textColor = 'text-orange-700'; bgColor = 'bg-orange-50'
  } else if (ratio <= 0.6) {
    color = 'bg-yellow-500'; textColor = 'text-yellow-700'; bgColor = 'bg-yellow-50'
  }
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className={`text-sm font-medium ${textColor} ${bgColor} px-2 py-0.5 rounded-full`}>
        {available} / {total}
      </span>
    </div>
  )
}

const CountdownTimer = ({ expiresAt }: { expiresAt: string }) => {
  const [timeInfo, setTimeInfo] = useState(formatTimeRemaining(expiresAt))

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeInfo(formatTimeRemaining(expiresAt))
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  if (timeInfo.seconds <= 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-red-600 font-bold text-sm">EXPIRED</span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className={`font-mono font-bold text-lg ${
            timeInfo.seconds <= 60 ? 'text-red-600 animate-pulse' :
            timeInfo.seconds <= 180 ? 'text-orange-600' : 'text-amber-600'
          }`}>
            {timeInfo.text}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">remaining</span>
      </div>
      <Progress value={timeInfo.percent} className="h-1.5" />
    </div>
  )
}

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { label: string; className: string }> = {
    pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
    confirmed: { label: 'Confirmed', className: 'bg-green-100 text-green-800 border-green-200' },
    released:  { label: 'Released',  className: 'bg-gray-100 text-gray-600 border-gray-200' },
    expired:   { label: 'Expired',   className: 'bg-red-100 text-red-800 border-red-200' },
  }
  const c = config[status] ?? config.pending
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>
}

// --- Main App ---------------------------------

export default function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [activeTab, setActiveTab] = useState('products')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, string | boolean | null>>({})
  const [reserveDialog, setReserveDialog] = useState<ReserveDialogState>({
    open: false, product: null, warehouseId: '', quantity: 1,
  })

  // -- Data fetching --

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products')
      if (res.ok) setProducts(await res.json())
    } catch (e) { console.error('Failed to fetch products:', e) }
  }, [])

  const fetchReservations = useCallback(async () => {
    try {
      const res = await fetch('/api/reservations')
      if (res.ok) setReservations(await res.json())
    } catch (e) { console.error('Failed to fetch reservations:', e) }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchProducts(), fetchReservations()])
    setLoading(false)
  }, [fetchProducts, fetchReservations])

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      fetchProducts(); fetchReservations()
    }, 15000)
    return () => clearInterval(interval)
  }, [loadData, fetchProducts, fetchReservations])

  // -- Actions --

  const handleReserve = async () => {
    const { product, warehouseId, quantity } = reserveDialog
    if (!product || !warehouseId || quantity < 1) {
      toast.error('Please select a warehouse and quantity'); return
    }
    setActionLoading((prev) => ({ ...prev, reserve: true }))
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `${product.id}-${warehouseId}-${Date.now()}`,
        },
        body: JSON.stringify({ productId: product.id, warehouseId, quantity: Number(quantity) }),
      })
      const data = await res.json()
      if (res.status === 409) {
        toast.error('Not enough stock available', {
          description: `Only ${data.availableStock ?? 0} unit(s) available.`,
        })
      } else if (res.status === 404) {
        toast.error('Product not found in this warehouse')
      } else if (!res.ok) {
        toast.error(data.error || 'Failed to create reservation')
      } else {
        toast.success('Stock reserved successfully!', {
          description: `Reserved ${quantity} unit(s) for 10 minutes.`,
        })
        setReserveDialog({ open: false, product: null, warehouseId: '', quantity: 1 })
        setActiveTab('reservations')
      }
      await Promise.all([fetchProducts(), fetchReservations()])
    } catch { toast.error('Network error. Please try again.') }
    finally { setActionLoading((prev) => ({ ...prev, reserve: false })) }
  }

  const handleConfirm = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: 'confirming' }))
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, { method: 'POST' })
      const data = await res.json()
      if (res.status === 410) {
        toast.error('Reservation has expired', {
          description: 'The 10-minute window has passed. Stock has been released.',
        })
      } else if (!res.ok) {
        toast.error(data.error || 'Failed to confirm reservation')
      } else {
        toast.success('Purchase confirmed!', {
          description: 'Stock has been permanently deducted.',
        })
      }
      await Promise.all([fetchProducts(), fetchReservations()])
    } catch { toast.error('Network error.') }
    finally { setActionLoading((prev) => ({ ...prev, [id]: null })) }
  }

  const handleRelease = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: 'releasing' }))
    try {
      const res = await fetch(`/api/reservations/${id}/release`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) toast.error(data.error || 'Failed to release reservation')
      else toast.success('Reservation cancelled', { description: 'Stock released.' })
      await Promise.all([fetchProducts(), fetchReservations()])
    } catch { toast.error('Network error.') }
    finally { setActionLoading((prev) => ({ ...prev, [id]: null })) }
  }

  const handleReseed = async () => {
    setActionLoading((prev) => ({ ...prev, reseed: true }))
    try {
      await fetch('/api/seed', { method: 'POST' })
      toast.success('Database reseeded with fresh data!')
      await loadData()
    } catch { toast.error('Failed to reseed') }
    finally { setActionLoading((prev) => ({ ...prev, reseed: false })) }
  }

  // -- Derived state --

  const selectedWarehouseStock = reserveDialog.product?.inventory?.find(
    (inv) => inv.warehouseId === reserveDialog.warehouseId
  )
  const pendingReservations = reservations.filter((r) => r.status === 'pending')
  const completedReservations = reservations.filter((r) => r.status !== 'pending')

  // -- Render --

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <Toaster richColors position="top-right" />

      {/* -- Header -- */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-lg">📦</div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">StockReserve</h1>
                <p className="text-xs text-muted-foreground">Inventory Reservation System</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {pendingReservations.length > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-medium" variant="outline">
                  {pendingReservations.length} Active
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReseed} disabled={!!actionLoading.reseed} className="text-muted-foreground">
                {actionLoading.reseed ? 'Reseeding...' : 'Reset Data'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* -- Main -- */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="products" className="gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
              Products
            </TabsTrigger>
            <TabsTrigger value="reservations" className="gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
              Reservations
              {pendingReservations.length > 0 && (
                <Badge className="bg-amber-500 text-white h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full ml-1">
                  {pendingReservations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* -- Products Tab -- */}
          <TabsContent value="products">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1,2,3,4,5,6].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardHeader><div className="h-6 bg-muted rounded w-3/4" /><div className="h-4 bg-muted rounded w-1/2 mt-2" /></CardHeader>
                    <CardContent><div className="h-20 bg-muted rounded" /></CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product) => (
                  <Card key={product.id} className="group hover:shadow-lg transition-all duration-300 border-slate-200 hover:border-indigo-200 overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{product.emoji}</span>
                          <div>
                            <CardTitle className="text-base leading-tight">{product.name}</CardTitle>
                            <CardDescription className="text-xs mt-0.5">{product.description}</CardDescription>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-2xl font-bold text-slate-900">{formatPrice(product.price)}</span>
                        <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                      </div>
                    </CardHeader>
                    <Separator />
                    <CardContent className="pt-3 pb-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Stock by Warehouse</p>
                      <div className="space-y-2">
                        {product.inventory?.map((inv) => (
                          <div key={inv.warehouseId} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                            <span className="text-sm text-slate-700 truncate mr-2">{inv.warehouseName}</span>
                            <StockIndicator available={inv.availableStock} total={inv.totalStock} />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                    <CardFooter className="pt-2">
                      <Button
                        className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg transition-all"
                        onClick={() => setReserveDialog({ open: true, product, warehouseId: '', quantity: 1 })}
                        disabled={product.totalAvailable <= 0}
                      >
                        {product.totalAvailable <= 0 ? (
                          <><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg> Out of Stock</>
                        ) : (
                          <><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg> Reserve Stock</>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* -- Reservations Tab -- */}
          <TabsContent value="reservations">
            {reservations.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="text-5xl mb-4">🛒</div>
                  <h3 className="text-lg font-semibold text-slate-700">No reservations yet</h3>
                  <p className="text-muted-foreground mt-1">Reserve a product to see it here</p>
                  <Button variant="outline" className="mt-4" onClick={() => setActiveTab('products')}>Browse Products</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {pendingReservations.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      Active Reservations ({pendingReservations.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingReservations.map((r) => (
                        <Card key={r.id} className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-md">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{r.productEmoji}</span>
                                <div>
                                  <CardTitle className="text-sm">{r.productName}</CardTitle>
                                  <CardDescription className="text-xs">{r.warehouseName}</CardDescription>
                                </div>
                              </div>
                              <StatusBadge status={r.status} />
                            </div>
                          </CardHeader>
                          <CardContent className="pb-3">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm text-muted-foreground">Quantity</span>
                              <span className="font-bold text-lg">{r.quantity} unit(s)</span>
                            </div>
                            <CountdownTimer expiresAt={r.expiresAt} />
                          </CardContent>
                          <Separator />
                          <CardFooter className="pt-3 gap-2">
                            <Button
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleConfirm(r.id)}
                              disabled={actionLoading[r.id] === 'confirming'}
                            >
                              {actionLoading[r.id] === 'confirming' ? (
                                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin mr-1"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Confirming...</>
                              ) : (
                                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M20 6 9 17l-5-5"/></svg> Confirm Purchase</>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => handleRelease(r.id)}
                              disabled={actionLoading[r.id] === 'releasing'}
                            >
                              {actionLoading[r.id] === 'releasing' ? 'Cancelling...' : 'Cancel'}
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {completedReservations.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-slate-700 mb-3">History ({completedReservations.length})</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {completedReservations.map((r) => (
                        <Card key={r.id} className={`opacity-75 ${
                          r.status === 'confirmed' ? 'border-green-200 bg-green-50/50' : 'border-slate-200 bg-slate-50/50'
                        }`}>
                          <CardHeader className="py-3 px-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{r.productEmoji}</span>
                                <div>
                                  <p className="text-sm font-medium">{r.productName}</p>
                                  <p className="text-xs text-muted-foreground">{r.warehouseName} &middot; {r.quantity} unit(s)</p>
                                </div>
                              </div>
                              <StatusBadge status={r.status} />
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* -- Reserve Dialog -- */}
      <Dialog
        open={reserveDialog.open}
        onOpenChange={(open) => {
          if (!open) setReserveDialog({ open: false, product: null, warehouseId: '', quantity: 1 })
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{reserveDialog.product?.emoji}</span>
              Reserve {reserveDialog.product?.name}
            </DialogTitle>
            <DialogDescription>
              Select a warehouse and quantity. Stock will be held for 10 minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Warehouse</label>
              <Select value={reserveDialog.warehouseId} onValueChange={(v) => setReserveDialog((prev) => ({ ...prev, warehouseId: v, quantity: 1 }))}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {reserveDialog.product?.inventory?.map((inv) => (
                    <SelectItem key={inv.warehouseId} value={inv.warehouseId} disabled={inv.availableStock <= 0}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{inv.warehouseName}</span>
                        <span className={`text-xs ${inv.availableStock <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {inv.availableStock} available
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setReserveDialog((prev) => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))} disabled={reserveDialog.quantity <= 1}>-</Button>
                <Input type="number" min={1} max={selectedWarehouseStock?.availableStock || 1} value={reserveDialog.quantity} onChange={(e) => setReserveDialog((prev) => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value) || 1) }))} className="w-20 text-center" />
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setReserveDialog((prev) => ({ ...prev, quantity: Math.min(prev.quantity + 1, selectedWarehouseStock?.availableStock || prev.quantity) }))} disabled={!selectedWarehouseStock || reserveDialog.quantity >= (selectedWarehouseStock?.availableStock ?? 0)}>+</Button>
              </div>
              {selectedWarehouseStock && (
                <p className="text-xs text-muted-foreground">
                  {selectedWarehouseStock.availableStock} unit(s) available at {selectedWarehouseStock.warehouseName}
                </p>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                <p className="text-xs text-blue-800">
                  Reserving stock holds it for <strong>10 minutes</strong>. You must confirm your purchase within this window, or the stock will be automatically released.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReserveDialog({ open: false, product: null, warehouseId: '', quantity: 1 })}>Cancel</Button>
            <Button className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white" onClick={handleReserve} disabled={!reserveDialog.warehouseId || reserveDialog.quantity < 1 || !!actionLoading.reserve}>
              {actionLoading.reserve ? (
                <><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin mr-1"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Reserving...</>
              ) : (
                `Reserve ${reserveDialog.quantity} Unit(s)`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -- Footer -- */}
      <footer className="border-t border-slate-200 bg-white/60 mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-slate-700">How it works</p>
              <p className="mt-1">Reserve → Hold stock for 10 min → Confirm purchase or cancel → Stock updates atomically</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/></svg>
                Concurrency Safe
              </span>
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Auto-Expiry
              </span>
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                Idempotent
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
