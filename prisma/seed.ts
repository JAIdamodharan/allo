import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');
  
  // Create products
  const productA = await prisma.product.create({
    data: {
      name: 'Ergonomic Chair',
      description: 'A very comfortable chair.',
      price: 199.99,
      imageUrl: 'https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?w=500&q=80',
    },
  });

  const productB = await prisma.product.create({
    data: {
      name: 'Standing Desk',
      description: 'Adjustable height standing desk.',
      price: 499.00,
      imageUrl: 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=500&q=80',
    },
  });

  // Create warehouses
  const warehouse1 = await prisma.warehouse.create({
    data: { name: 'East Coast Hub' },
  });

  const warehouse2 = await prisma.warehouse.create({
    data: { name: 'West Coast Hub' },
  });

  // Create stock levels
  await prisma.stockLevel.create({
    data: {
      productId: productA.id,
      warehouseId: warehouse1.id,
      totalUnits: 10,
      reservedUnits: 0,
    },
  });

  await prisma.stockLevel.create({
    data: {
      productId: productA.id,
      warehouseId: warehouse2.id,
      totalUnits: 5,
      reservedUnits: 0,
    },
  });

  await prisma.stockLevel.create({
    data: {
      productId: productB.id,
      warehouseId: warehouse1.id,
      totalUnits: 2,
      reservedUnits: 0,
    },
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
