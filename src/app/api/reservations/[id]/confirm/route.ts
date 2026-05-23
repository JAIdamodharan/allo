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
    try {
      const updatedReservation = await prisma.$transaction(async (tx) => {
        // Atomic update: only transition status if it is currently PENDING
        const updatedCount = await tx.$executeRaw`
          UPDATE "Reservation"
          SET "status" = 'CONFIRMED'
          WHERE "id" = ${id} AND "status" = 'PENDING'
        `;

        if (updatedCount === 0) {
          throw new Error('RESERVATION_NOT_PENDING');
        }

        // Deduct stock
        await tx.$executeRaw`
          UPDATE "StockLevel"
          SET "totalUnits" = "totalUnits" - ${reservation.quantity},
              "reservedUnits" = "reservedUnits" - ${reservation.quantity}
          WHERE "id" = ${reservation.stockLevelId}
        `;

        // Fetch and return the fully populated updated reservation
        return tx.reservation.findUnique({
          where: { id },
          include: {
            stockLevel: {
              include: {
                product: true,
                warehouse: true,
              },
            },
          },
        });
      });

      if (idempotencyKey && redis) {
        await redis.set(`idempotency:confirm:${idempotencyKey}`, updatedReservation, { ex: 3600 });
      }

      return NextResponse.json(updatedReservation);
    } catch (err: any) {
      if (err.message === 'RESERVATION_NOT_PENDING') {
        const current = await prisma.reservation.findUnique({
          where: { id },
          include: {
            stockLevel: {
              include: {
                product: true,
                warehouse: true,
              },
            },
          },
        });
        if (current?.status === 'CONFIRMED') {
          return NextResponse.json(current);
        }
        return NextResponse.json({ error: 'Reservation is no longer pending' }, { status: 400 });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error confirming reservation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
