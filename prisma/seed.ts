import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clear existing data
  await prisma.idempotencyKey.deleteMany()
  await prisma.reservation.deleteMany()
  await prisma.inventory.deleteMany()
  await prisma.product.deleteMany()
  await prisma.warehouse.deleteMany()

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

  const stockLevels = [
    [3, 5, 2],
    [8, 10, 6],
    [15, 12, 8],
    [2, 1, 3],
    [4, 6, 3],
    [1, 2, 1],
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

  console.log(`Seeded ${products.length} products, ${warehouses.length} warehouses, ${inventoryData.length} inventory records`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
