'use client';

import { useState, useEffect, use } from 'react';
import { Package, Clock, ShoppingCart, ArrowLeft } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatINR(usdAmount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(usdAmount * 83);
}

interface Reservation {
  id: string;
  stockLevelId: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED';
  expiresAt: string;
  stockLevel?: {
    id: string;
    product: {
      id: string;
      name: string;
      description: string | null;
      price: number;
      imageUrl: string | null;
    };
    warehouse: {
      id: string;
      name: string;
    };
  };
}

export default function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    fetch(`/api/reservations/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setReservation(data);
        else toast.error('Reservation not found');
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!reservation || reservation.status !== 'PENDING') return;
    const expiresAt = new Date(reservation.expiresAt).getTime();
    const tick = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) { setTimeLeft('00:00'); setExpired(true); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [reservation]);

  const confirm = async () => {
    const toastId = toast.loading('Processing payment...');
    const res = await fetch(`/api/reservations/${id}/confirm`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() }
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error, { id: toastId });
      if (res.status === 410 && reservation) setReservation({ ...reservation, status: 'RELEASED' });
      return;
    }
    toast.success('Payment confirmed!', { id: toastId });
    setReservation(data);
  };

  const cancel = async () => {
    const toastId = toast.loading('Cancelling...');
    const res = await fetch(`/api/reservations/${id}/release`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() }
    });
    if (res.ok) {
      toast.success('Reservation cancelled', { id: toastId });
      setReservation(await res.json());
    } else {
      toast.error('Failed to cancel', { id: toastId });
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-6 md:p-12">
      <div className="max-w-2xl mx-auto">

        <header className="flex justify-between items-center mb-16 pb-4 border-b border-zinc-200">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/')} className="text-zinc-400 hover:text-zinc-900 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">allo.</h1>
              <p className="text-sm text-zinc-500 mt-0.5">Secure Checkout</p>
            </div>
          </div>
          <ShoppingCart className="w-5 h-5 text-zinc-400" />
        </header>

        {reservation?.status === 'CONFIRMED' && (
          <div className="border border-zinc-200 bg-white p-10 text-center space-y-6">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <Package className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-xl font-semibold">Order Confirmed</h2>
              <p className="text-zinc-500 text-sm max-w-xs mx-auto">Your item has been secured. Stock permanently decremented.</p>
              <p className="font-mono text-xs text-zinc-400">ref: {reservation.id}</p>
            </div>

            {/* Confirmed Order Summary */}
            {reservation.stockLevel?.product && (
              <div className="border-t border-zinc-200 pt-6 text-left max-w-md mx-auto space-y-4">
                <div className="flex gap-4 p-4 bg-zinc-50 border border-zinc-150 rounded-sm">
                  {reservation.stockLevel.product.imageUrl && (
                    <div className="w-16 h-16 bg-white border border-zinc-200 flex-shrink-0 overflow-hidden">
                      <img 
                        src={reservation.stockLevel.product.imageUrl} 
                        alt={reservation.stockLevel.product.name} 
                        className="w-full h-full object-cover mix-blend-multiply" 
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-zinc-900 truncate">
                      {reservation.stockLevel.product.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      Quantity: <span className="font-medium text-zinc-800">{reservation.quantity}</span>
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Total: <span className="font-semibold text-zinc-800">{formatINR(reservation.stockLevel.product.price * reservation.quantity)}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-4 pt-2">
              <button onClick={() => router.push('/')} className="text-sm underline text-zinc-900">Back to store</button>
              <button onClick={() => router.push('/admin')} className="text-sm underline text-zinc-400">Admin view</button>
            </div>
          </div>
        )}

        {(reservation?.status === 'RELEASED' || !reservation) && (
          <div className="border border-zinc-200 bg-white p-10 text-center space-y-4">
            <h2 className="text-xl font-semibold">
              {!reservation ? 'Reservation Not Found' : 'Reservation Released'}
            </h2>
            <p className="text-zinc-500 text-sm">
              {!reservation ? 'This link may be invalid or expired.' : 'Stock has been returned to the pool.'}
            </p>
            <button onClick={() => router.push('/')} className="text-sm underline text-zinc-900">
              Continue shopping
            </button>
          </div>
        )}

        {reservation?.status === 'PENDING' && (
          <div className="border border-zinc-200 bg-white">

            {/* Timer bar */}
            <div className={cn(
              'px-8 py-4 flex justify-between items-center border-b',
              expired ? 'bg-red-50 border-red-200' : 'bg-zinc-50 border-zinc-200'
            )}>
              <div className="flex items-center gap-2.5">
                <Clock className={cn('w-4 h-4', expired ? 'text-red-500' : 'text-zinc-500')} />
                <span className={cn('text-sm font-medium', expired ? 'text-red-700' : 'text-zinc-700')}>
                  {expired ? 'Reservation expired' : 'Items on hold'}
                </span>
              </div>
              <span className={cn('font-mono text-xl font-bold', expired ? 'text-red-600' : 'text-zinc-900')}>
                {timeLeft}
              </span>
            </div>

            {/* Order summary */}
            <div className="px-8 py-6 space-y-6 border-b border-zinc-100">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Order Summary</h2>
                {reservation.stockLevel?.warehouse.name && (
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-500 bg-zinc-150 px-2 py-0.5 rounded-sm">
                    Reserved from: <span className="font-medium text-zinc-800">{reservation.stockLevel.warehouse.name}</span>
                  </span>
                )}
              </div>

              {reservation.stockLevel?.product && (
                <div className="flex gap-4 p-4 bg-zinc-50 border border-zinc-150 rounded-sm">
                  {reservation.stockLevel.product.imageUrl && (
                    <div className="w-20 h-20 bg-white border border-zinc-250 flex-shrink-0 overflow-hidden">
                      <img 
                        src={reservation.stockLevel.product.imageUrl} 
                        alt={reservation.stockLevel.product.name} 
                        className="w-full h-full object-cover mix-blend-multiply" 
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-zinc-900 truncate">
                      {reservation.stockLevel.product.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                      {reservation.stockLevel.product.description}
                    </p>
                    <p className="text-xs text-zinc-400 mt-2">
                      Unit Price: {formatINR(reservation.stockLevel.product.price)}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Quantity Reserved</span>
                  <span className="font-medium">{reservation.quantity}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Status</span>
                  <span className="text-amber-600 font-medium">Pending payment</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Reservation ID</span>
                  <span className="font-mono text-xs text-zinc-400">{reservation.id.slice(0, 16)}…</span>
                </div>

                {reservation.stockLevel?.product && (
                  <div className="flex justify-between text-sm pt-4 border-t border-dashed border-zinc-200">
                    <span className="text-zinc-900 font-medium">Total Price</span>
                    <span className="text-lg font-bold text-zinc-900">
                      {formatINR(reservation.stockLevel.product.price * reservation.quantity)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Note about concurrency guarantee */}
            <div className="px-8 py-4 bg-blue-50 border-b border-blue-100">
              <p className="text-xs text-blue-600">
                🔒 Your units are atomically locked in our database. No other customer can claim them while this timer is running.
              </p>
            </div>

            {/* Actions */}
            <div className="px-8 py-6 flex gap-3">
              <button
                onClick={cancel}
                className="flex-1 py-3 text-sm border border-zinc-200 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={expired}
                className={cn(
                  'flex-1 py-3 text-sm border font-medium transition-colors',
                  expired
                    ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed'
                    : 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
                )}
              >
                Confirm Purchase
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
