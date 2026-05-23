import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idempotencyKey = request.headers.get('Idempotency-Key');

    // Idempotency check
    if (idempotencyKey && redis) {
      const cached = await redis.get(`idempotency:release:${idempotencyKey}`);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.status === 'RELEASED') {
      return NextResponse.json(reservation); // Already released
    }

    if (reservation.status === 'CONFIRMED') {
      return NextResponse.json({ error: 'Cannot release a confirmed reservation' }, { status: 400 });
    }

    // Release the reservation
    const [, updatedReservation] = await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "StockLevel"
        SET "reservedUnits" = "reservedUnits" - ${reservation.quantity}
        WHERE "id" = ${reservation.stockLevelId}
      `,
      prisma.reservation.update({
        where: { id },
        data: { status: 'RELEASED' },
      }),
    ]);

    if (idempotencyKey && redis) {
      await redis.set(`idempotency:release:${idempotencyKey}`, updatedReservation, { ex: 3600 });
    }

    return NextResponse.json(updatedReservation);
  } catch (error) {
    console.error('Error releasing reservation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
