import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');
  
  // Clean existing data to avoid duplicates or key violations
  console.log('Cleaning existing data...');
  await prisma.reservation.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.product.deleteMany();
  
  // Create products across different price ranges
  const productsData = [
    // Low-end / Budget (< $50)
    {
      name: 'Cable Management Sleeve',
      description: 'Flexible neoprene organizer wrap with zipper, pack of 4. Keep your desk clutter-free.',
      price: 14.99,
      imageUrl: 'https://images.unsplash.com/photo-1558244661-d248897f7bc4?w=500&q=80',
    },
    {
      name: 'Ergonomic Mouse Mat',
      description: 'Memory foam wrist support with smooth Lycra cover to reduce wrist strain.',
      price: 19.99,
      imageUrl: 'https://images.unsplash.com/photo-1616440347437-b1c73416efc2?w=500&q=80',
    },
    {
      name: 'Minimalist Water Bottle',
      description: 'Double-walled vacuum insulated stainless steel bottle. Keeps drinks cold for 24h.',
      price: 29.50,
      imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=500&q=80',
    },
    // Mid-range ($50 - $250)
    {
      name: 'Mechanical Keyboard',
      description: 'Hot-swappable tactile mechanical keyboard with layout-customizable RGB backlighting.',
      price: 129.99,
      imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&q=80',
    },
    {
      name: 'Noise-Cancelling Headphones',
      description: 'Wireless over-ear headphones with active noise cancellation and 30-hour battery life.',
      price: 179.00,
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80',
    },
    {
      name: 'Ergonomic Chair',
      description: 'Breathable mesh back with adjustable lumbar support and 3D armrests.',
      price: 199.99,
      imageUrl: 'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?w=500&q=80',
    },
    // High-end ($250+)
    {
      name: 'Standing Desk',
      description: 'Dual-motor adjustable height standing desk with premium oak top and 4 memory presets.',
      price: 499.00,
      imageUrl: 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=500&q=80',
    },
    {
      name: '4K UltraWide Monitor',
      description: '34-inch curved IPS monitor featuring 99% sRGB color gamut and USB-C power delivery.',
      price: 799.99,
      imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&q=80',
    },
    {
      name: 'Premium Leather Office Chair',
      description: 'Genuine top-grain leather executive chair with aluminum frame and synchronized tilt.',
      price: 1200.00,
      imageUrl: 'https://images.unsplash.com/photo-1580481072645-022f9a6dbf27?w=500&q=80',
    },
  ];

  const products = [];
  for (const data of productsData) {
    const product = await prisma.product.create({ data });
    products.push(product);
  }

  // Create warehouses
  const warehouse1 = await prisma.warehouse.create({
    data: { name: 'East Coast Hub' },
  });

  const warehouse2 = await prisma.warehouse.create({
    data: { name: 'West Coast Hub' },
  });

  // Create stock levels for all products in both warehouses
  for (const product of products) {
    let eastStock = 10;
    let westStock = 5;

    if (product.price > 500) {
      eastStock = 3;
      westStock = 2;
    } else if (product.price < 50) {
      eastStock = 25;
      westStock = 15;
    }

    await prisma.stockLevel.create({
      data: {
        productId: product.id,
        warehouseId: warehouse1.id,
        totalUnits: eastStock,
        reservedUnits: 0,
      },
    });

    await prisma.stockLevel.create({
      data: {
        productId: product.id,
        warehouseId: warehouse2.id,
        totalUnits: westStock,
        reservedUnits: 0,
      },
    });
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
