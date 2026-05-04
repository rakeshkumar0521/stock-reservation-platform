import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// Types for raw SQL query results
interface InventoryRow {
  id: string
  productId: string
  warehouseId: string
  totalStock: number
  reservedStock: number
}

// ---------------------------------------------
// Helpers
// ---------------------------------------------

function cors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

function json(data: unknown, status = 200): NextResponse {
  return cors(NextResponse.json(data, { status }))
}

// ---------------------------------------------
// Lazy expiry cleanup
// ---------------------------------------------

async function cleanupExpiredReservations(): Promise<number> {
  const now = new Date()

  // Find expired pending reservations
  const expired = await prisma.reservation.findMany({
    where: { status: 'pending', expiresAt: { lte: now } },
  })

  for (const reservation of expired) {
    await prisma.$transaction(async (tx) => {
      // Release reserved stock
      await tx.inventory.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: { reservedStock: { decrement: reservation.quantity } },
      })
      // Mark reservation as released
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'released', releasedAt: now, releaseReason: 'expired' },
      })
    })
  }

  return expired.length
}

// ---------------------------------------------
// Seed data
// ---------------------------------------------

async function seedDatabase(): Promise<void> {
  const count = await prisma.product.count()
  if (count > 0) return

  const products = await prisma.product.createManyAndReturn({
    data: [
      { name: 'MacBook Pro 16"', description: 'Apple M3 Pro chip, 18GB RAM, 512GB SSD', price: 2499, category: 'Laptops', emoji: '\u{1F4BB}' },
      { name: 'iPhone 15 Pro', description: '256GB, Natural Titanium, A17 Pro', price: 1199, category: 'Phones', emoji: '\u{1F4F1}' },
      { name: 'Sony WH-1000XM5', description: 'Wireless Noise Cancelling Headphones', price: 349, category: 'Audio', emoji: '\u{1F3A7}' },
      { name: 'iPad Air M2', description: '11-inch, 128GB, Wi-Fi', price: 599, category: 'Tablets', emoji: '\u{1F4CB}' },
      { name: 'Samsung 4K TV 65"', description: 'Crystal UHD, Smart TV, HDR10+', price: 899, category: 'TVs', emoji: '\u{1F4FA}' },
      { name: 'Nintendo Switch OLED', description: 'White model, 64GB storage', price: 349, category: 'Gaming', emoji: '\u{1F3AE}' },
    ],
  })

  const warehouses = await prisma.warehouse.createManyAndReturn({
    data: [
      { name: 'West Coast Hub', location: 'San Francisco, CA', emoji: '\u{1F309}' },
      { name: 'East Coast Hub', location: 'New York, NY', emoji: '\u{1F5FD}' },
      { name: 'Central Hub', location: 'Chicago, IL', emoji: '\u{1F3D9}' },
    ],
  })

  // Stock levels: some items have very low stock to showcase the reservation system
  const stockLevels = [
    [3, 5, 2],   // MacBook - limited
    [8, 10, 6],  // iPhone
    [15, 12, 8], // Sony headphones
    [2, 1, 3],   // iPad Air - very limited
    [4, 6, 3],   // Samsung TV
    [1, 2, 1],   // Nintendo Switch - scarce!
  ]

  const inventoryData = products.flatMap((product, i) =>
    warehouses.map((warehouse, j) => ({
      productId: product.id,
      warehouseId: warehouse.id,
      totalStock: stockLevels[i][j],
      reservedStock: 0,
    }))
  )

  await prisma.inventory.createMany({ data: inventoryData })
  console.log('Database seeded with sample data')
}

// ---------------------------------------------
// OPTIONS (CORS preflight)
// ---------------------------------------------

export async function OPTIONS(): Promise<NextResponse> {
  return cors(new NextResponse(null, { status: 200 }))
}

// ---------------------------------------------
// Main route handler
// ---------------------------------------------

async function handleRoute(
  request: NextRequest,
  { params }: { params: { path?: string[] } }
): Promise<NextResponse> {
  const { path = [] } = params
  const route = '/' + path.join('/')
  const method = request.method

  try {
    // Lazy cleanup on every request
    await cleanupExpiredReservations()

    // ========================================
    // GET /api/health
    // ========================================
    if (route === '/health' && method === 'GET') {
      return json({ status: 'ok', timestamp: new Date(), database: 'postgresql' })
    }

    // ========================================
    // GET /api/products
    // Returns all products with available stock per warehouse
    // ========================================
    if (route === '/products' && method === 'GET') {
      await seedDatabase()

      const products = await prisma.product.findMany({
        include: {
          inventory: {
            include: { warehouse: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      })

      const result = products.map((p) => {
        const inventory = p.inventory.map((inv) => ({
          warehouseId: inv.warehouseId,
          warehouseName: inv.warehouse.name,
          warehouseLocation: inv.warehouse.location ?? '',
          totalStock: inv.totalStock,
          reservedStock: inv.reservedStock,
          availableStock: inv.totalStock - inv.reservedStock,
        }))

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          category: p.category,
          emoji: p.emoji,
          totalAvailable: inventory.reduce((sum, inv) => sum + inv.availableStock, 0),
          inventory,
        }
      })

      return json(result)
    }

    // ========================================
    // GET /api/warehouses
    // ========================================
    if (route === '/warehouses' && method === 'GET') {
      const warehouses = await prisma.warehouse.findMany({ orderBy: { createdAt: 'asc' } })
      return json(warehouses)
    }

    // ========================================
    // GET /api/reservations
    // ========================================
    if (route === '/reservations' && method === 'GET') {
      const reservations = await prisma.reservation.findMany({
        include: { product: true, warehouse: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })

      const result = reservations.map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: r.product.name,
        productEmoji: r.product.emoji ?? '\u{1F4E6}',
        warehouseId: r.warehouseId,
        warehouseName: r.warehouse.name,
        quantity: r.quantity,
        status: r.status,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        confirmedAt: r.confirmedAt,
        releasedAt: r.releasedAt,
        releaseReason: r.releaseReason,
      }))

      return json(result)
    }

    // ========================================
    // POST /api/reservations
    // CONCURRENCY-SAFE: Uses PostgreSQL SELECT FOR UPDATE
    // ========================================
    if (route === '/reservations' && method === 'POST') {
      const body = await request.json()
      const { productId, warehouseId, quantity } = body as {
        productId?: string
        warehouseId?: string
        quantity?: number
      }

      if (!productId || !warehouseId || !quantity || quantity < 1) {
        return json({ error: 'productId, warehouseId, and quantity (>= 1) are required' }, 400)
      }

      const qty = Math.floor(Number(quantity))
      if (isNaN(qty) || qty < 1) {
        return json({ error: 'quantity must be a positive integer' }, 400)
      }

      // -- Idempotency check --
      const idempotencyKey =
        request.headers.get('Idempotency-Key') ||
        request.headers.get('idempotency-key')

      if (idempotencyKey) {
        const existing = await prisma.idempotencyKey.findUnique({
          where: { key: idempotencyKey },
        })
        if (existing) {
          const existingRes = await prisma.reservation.findUnique({
            where: { id: existing.reservationId },
          })
          if (existingRes) {
            return json({
              id: existingRes.id,
              message: 'Duplicate request - returning existing reservation',
              duplicate: true,
              status: existingRes.status,
              expiresAt: existingRes.expiresAt,
              createdAt: existingRes.createdAt,
            })
          }
        }
      }

      // -- ATOMIC RESERVATION with row-level locking --
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Row-level lock: SELECT ... FOR UPDATE prevents concurrent modifications
          const rows = await tx.$queryRaw<InventoryRow[]>`
            SELECT "id", "productId", "warehouseId", "totalStock", "reservedStock"
            FROM "Inventory"
            WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
            FOR UPDATE
          `

          const inv = rows[0]
          if (!inv) {
            throw new Error('NOT_FOUND')
          }

          const available = inv.totalStock - inv.reservedStock
          if (available < qty) {
            throw new Error(`INSUFFICIENT_STOCK:${available}`)
          }

          // Increment reservedStock
          await tx.inventory.update({
            where: {
              productId_warehouseId: { productId, warehouseId },
            },
            data: { reservedStock: { increment: qty } },
          })

          // Create reservation with 10-minute expiry
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
          const reservation = await tx.reservation.create({
            data: {
              productId,
              warehouseId,
              quantity: qty,
              status: 'pending',
              expiresAt,
            },
          })

          // Store idempotency key
          if (idempotencyKey) {
            await tx.idempotencyKey.create({
              data: { key: idempotencyKey, reservationId: reservation.id },
            })
          }

          return {
            reservation,
            availableStockAfter: available - qty,
          }
        })

        return json(
          {
            id: result.reservation.id,
            productId: result.reservation.productId,
            warehouseId: result.reservation.warehouseId,
            quantity: result.reservation.quantity,
            status: result.reservation.status,
            expiresAt: result.reservation.expiresAt,
            createdAt: result.reservation.createdAt,
            availableStockAfter: result.availableStockAfter,
          },
          201
        )
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : ''
        if (message === 'NOT_FOUND') {
          return json({ error: 'Product not found in this warehouse' }, 404)
        }
        if (message.startsWith('INSUFFICIENT_STOCK')) {
          const available = parseInt(message.split(':')[1]) || 0
          return json({ error: 'Not enough stock available', availableStock: available }, 409)
        }
        throw err
      }
    }

    // ========================================
    // POST /api/reservations/:id/confirm
    // Confirm reservation (payment success)
    // ========================================
    if (
      path.length === 3 &&
      path[0] === 'reservations' &&
      path[2] === 'confirm' &&
      method === 'POST'
    ) {
      const reservationId = path[1]

      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      })

      if (!reservation) {
        return json({ error: 'Reservation not found' }, 404)
      }
      if (reservation.status === 'confirmed') {
        return json({ error: 'Reservation already confirmed', status: 'confirmed' }, 400)
      }
      if (reservation.status === 'released') {
        return json({ error: 'Reservation already released/cancelled', status: 'released' }, 400)
      }

      // Check expiry
      if (new Date() > reservation.expiresAt) {
        // Auto-release expired reservation
        await prisma.$transaction(async (tx) => {
          await tx.inventory.update({
            where: {
              productId_warehouseId: {
                productId: reservation.productId,
                warehouseId: reservation.warehouseId,
              },
            },
            data: { reservedStock: { decrement: reservation.quantity } },
          })
          await tx.reservation.update({
            where: { id: reservationId },
            data: { status: 'released', releasedAt: new Date(), releaseReason: 'expired' },
          })
        })
        return json({ error: 'Reservation has expired', status: 'expired' }, 410)
      }

      // Confirm: atomically decrease both totalStock and reservedStock
      await prisma.$transaction(async (tx) => {
        await tx.inventory.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: {
            totalStock: { decrement: reservation.quantity },
            reservedStock: { decrement: reservation.quantity },
          },
        })
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'confirmed', confirmedAt: new Date() },
        })
      })

      return json({
        id: reservationId,
        status: 'confirmed',
        message: 'Reservation confirmed successfully! Stock permanently deducted.',
        confirmedAt: new Date(),
      })
    }

    // ========================================
    // POST /api/reservations/:id/release
    // Release reservation (cancel or payment failed)
    // ========================================
    if (
      path.length === 3 &&
      path[0] === 'reservations' &&
      path[2] === 'release' &&
      method === 'POST'
    ) {
      const reservationId = path[1]

      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      })

      if (!reservation) {
        return json({ error: 'Reservation not found' }, 404)
      }
      if (reservation.status === 'confirmed') {
        return json({ error: 'Cannot release a confirmed reservation', status: 'confirmed' }, 400)
      }
      if (reservation.status === 'released') {
        return json({ error: 'Reservation already released', status: 'released' }, 400)
      }

      await prisma.$transaction(async (tx) => {
        await tx.inventory.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: { reservedStock: { decrement: reservation.quantity } },
        })
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: 'released', releasedAt: new Date(), releaseReason: 'cancelled' },
        })
      })

      return json({
        id: reservationId,
        status: 'released',
        message: 'Reservation cancelled. Stock released back to inventory.',
        releasedAt: new Date(),
      })
    }

    // ========================================
    // POST /api/seed  –  Reset & reseed
    // ========================================
    if (route === '/seed' && method === 'POST') {
      // Delete in correct order (foreign keys)
      await prisma.idempotencyKey.deleteMany()
      await prisma.reservation.deleteMany()
      await prisma.inventory.deleteMany()
      await prisma.product.deleteMany()
      await prisma.warehouse.deleteMany()
      await seedDatabase()
      return json({ message: 'Database reseeded successfully' })
    }

    // ========================================
    // Root
    // ========================================
    if ((route === '/' || route === '/root') && method === 'GET') {
      return json({ message: 'Inventory Reservation System API', version: '1.0.0' })
    }

    return json({ error: `Route ${route} not found` }, 404)
  } catch (error: unknown) {
    console.error('API Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: 'Internal server error', details: message }, 500)
  }
}

// Export HTTP method handlers
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
