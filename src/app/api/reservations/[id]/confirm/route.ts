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
      const cached = await redis.get(`idempotency:confirm:${idempotencyKey}`);
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

    if (reservation.status === 'CONFIRMED') {
      return NextResponse.json(reservation); // Already confirmed
    }

    if (reservation.status === 'RELEASED') {
      return NextResponse.json({ error: 'Reservation was already released' }, { status: 400 });
    }

    // Check if expired
    if (new Date() > reservation.expiresAt) {
      // Lazy cleanup: if we notice it's expired during confirm, release it.
      await prisma.$transaction([
        prisma.reservation.update({
          where: { id },
          data: { status: 'RELEASED' },
        }),
        prisma.$executeRaw`
          UPDATE "StockLevel"
          SET "reservedUnits" = "reservedUnits" - ${reservation.quantity}
          WHERE "id" = ${reservation.stockLevelId}
        `
      ]);

      const errorResponse = { error: 'Reservation expired' };
      if (idempotencyKey && redis) {
        await redis.set(`idempotency:confirm:${idempotencyKey}`, errorResponse, { ex: 3600 });
      }
      return NextResponse.json(errorResponse, { status: 410 });
    }

    // Confirm the reservation and permanently deduct stock
    const [, updatedReservation] = await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "StockLevel"
        SET "totalUnits" = "totalUnits" - ${reservation.quantity},
            "reservedUnits" = "reservedUnits" - ${reservation.quantity}
        WHERE "id" = ${reservation.stockLevelId}
      `,
      prisma.reservation.update({
        where: { id },
        data: { status: 'CONFIRMED' },
      }),
    ]);

    if (idempotencyKey && redis) {
      await redis.set(`idempotency:confirm:${idempotencyKey}`, updatedReservation, { ex: 3600 });
    }

    return NextResponse.json(updatedReservation);
  } catch (error) {
    console.error('Error confirming reservation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
