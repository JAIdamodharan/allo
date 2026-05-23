import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const reservations = await prisma.reservation.findMany({
      include: {
        stockLevel: {
          include: {
            product: true,
            warehouse: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(reservations);
  } catch (error) {
    console.error('Error listing reservations:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { stockLevelId, quantity } = await request.json();
    const idempotencyKey = request.headers.get('Idempotency-Key');

    if (!stockLevelId || !quantity || quantity <= 0) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    // Atomic SQL: only increments if enough stock exists.
    // Safe under concurrent requests — Postgres row-level atomicity ensures
    // exactly one winner when two requests race for the last unit.
    const updatedRows = await prisma.$executeRaw`
      UPDATE "StockLevel"
      SET "reservedUnits" = "reservedUnits" + ${quantity}
      WHERE "id" = ${stockLevelId}
        AND "totalUnits" - "reservedUnits" >= ${quantity}
    `;

    if (updatedRows === 0) {
      return NextResponse.json({ error: 'Not enough stock available' }, { status: 409 });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const reservation = await prisma.reservation.create({
      data: {
        stockLevelId,
        quantity,
        expiresAt,
        idempotencyKey,
        status: 'PENDING',
      },
    });

    return NextResponse.json(reservation);
  } catch (error) {
    console.error('Error creating reservation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
