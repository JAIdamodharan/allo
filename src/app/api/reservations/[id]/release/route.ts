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
    try {
      const updatedReservation = await prisma.$transaction(async (tx) => {
        // Atomic update: only transition status if it is currently PENDING
        const updatedCount = await tx.$executeRaw`
          UPDATE "Reservation"
          SET "status" = 'RELEASED'
          WHERE "id" = ${id} AND "status" = 'PENDING'
        `;

        if (updatedCount === 0) {
          throw new Error('RESERVATION_NOT_PENDING');
        }

        // Return stock back to inventory
        await tx.$executeRaw`
          UPDATE "StockLevel"
          SET "reservedUnits" = "reservedUnits" - ${reservation.quantity}
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
        await redis.set(`idempotency:release:${idempotencyKey}`, updatedReservation, { ex: 3600 });
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
        if (current?.status === 'RELEASED') {
          return NextResponse.json(current);
        }
        return NextResponse.json({ error: 'Reservation is no longer pending' }, { status: 400 });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error releasing reservation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
