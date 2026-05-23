'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ArrowLeft, RefreshCw, Package, Warehouse, Clock, CheckCircle, XCircle } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StockLevel {
  id: string;
  warehouseName: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stockLevels: StockLevel[];
}

interface Reservation {
  id: string;
  quantity: number;
  status: 'PENDING' | 'CONFIRMED' | 'RELEASED';
  expiresAt: string;
  createdAt: string;
  stockLevel: {
    product: { name: string };
    warehouse: { name: string };
  };
}

const STATUS_STYLES = {
  PENDING:   'bg-amber-50 text-amber-700 border border-amber-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  RELEASED:  'bg-zinc-100 text-zinc-500 border border-zinc-200',
} as const;

const STATUS_ICONS = {
  PENDING:   <Clock className="w-3 h-3" />,
  CONFIRMED: <CheckCircle className="w-3 h-3" />,
  RELEASED:  <XCircle className="w-3 h-3" />,
} as const;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [prodRes, resRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/reservations'),
      ]);
      if (prodRes.ok) setProducts(await prodRes.json());
      if (resRes.ok) setReservations(await resRes.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    // Poll every 15s to keep the view fresh without a manual refresh
    const interval = setInterval(() => loadAll(true), 15000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const pending   = reservations.filter(r => r.status === 'PENDING').length;
  const confirmed = reservations.filter(r => r.status === 'CONFIRMED').length;
  const released  = reservations.filter(r => r.status === 'RELEASED').length;

  const filtered = statusFilter === 'ALL'
    ? reservations
    : reservations.filter(r => r.status === statusFilter);

  if (loading) return null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-12">

        {/* Header */}
        <header className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">allo. <span className="text-zinc-400 font-normal text-lg">/ admin</span></h1>
              <p className="text-sm text-zinc-500 mt-0.5">Inventory &amp; Reservations Overview</p>
            </div>
          </div>
          <button
            onClick={() => loadAll(true)}
            className={cn(
              'flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 transition-colors',
              refreshing && 'opacity-50 pointer-events-none'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Products',  value: products.length,  icon: <Package className="w-4 h-4" /> },
            { label: 'Pending',   value: pending,           icon: <Clock className="w-4 h-4 text-amber-500" /> },
            { label: 'Confirmed', value: confirmed,         icon: <CheckCircle className="w-4 h-4 text-emerald-500" /> },
            { label: 'Released',  value: released,          icon: <XCircle className="w-4 h-4 text-zinc-400" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-white border border-zinc-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">{label}</span>
                {icon}
              </div>
              <p className="text-3xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Inventory table */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-4">
            Inventory
          </h2>
          <div className="bg-white border border-zinc-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-400">
                  <th className="text-left px-5 py-3 font-semibold">Product</th>
                  <th className="text-left px-5 py-3 font-semibold">Warehouse</th>
                  <th className="text-right px-5 py-3 font-semibold">Total</th>
                  <th className="text-right px-5 py-3 font-semibold">Reserved</th>
                  <th className="text-right px-5 py-3 font-semibold">Available</th>
                  <th className="px-5 py-3 font-semibold">Stock</th>
                </tr>
              </thead>
              <tbody>
                {products.flatMap(p =>
                  p.stockLevels.map(sl => {
                    const pct = sl.totalUnits > 0
                      ? Math.round((sl.availableUnits / sl.totalUnits) * 100)
                      : 0;
                    return (
                      <tr key={sl.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                        <td className="px-5 py-3 font-medium">{p.name}</td>
                        <td className="px-5 py-3 text-zinc-500">{sl.warehouseName}</td>
                        <td className="px-5 py-3 text-right">{sl.totalUnits}</td>
                        <td className="px-5 py-3 text-right text-amber-600">{sl.reservedUnits}</td>
                        <td className="px-5 py-3 text-right font-semibold">
                          <span className={sl.availableUnits === 0 ? 'text-red-500' : 'text-emerald-600'}>
                            {sl.availableUnits}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="w-24 bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                pct > 50 ? 'bg-emerald-500' : pct > 20 ? 'bg-amber-400' : 'bg-red-500'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-400 mt-0.5 block">{pct}%</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reservations list */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Reservations
            </h2>
            <div className="flex gap-1">
              {(['ALL', 'PENDING', 'CONFIRMED', 'RELEASED'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'text-xs px-3 py-1 border rounded-sm font-medium transition-colors',
                    statusFilter === s
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-zinc-400">No reservations found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-400">
                    <th className="text-left px-5 py-3 font-semibold">ID</th>
                    <th className="text-left px-5 py-3 font-semibold">Product</th>
                    <th className="text-left px-5 py-3 font-semibold">Warehouse</th>
                    <th className="text-right px-5 py-3 font-semibold">Qty</th>
                    <th className="text-left px-5 py-3 font-semibold">Status</th>
                    <th className="text-left px-5 py-3 font-semibold">Expires</th>
                    <th className="text-left px-5 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isExpiredPending = r.status === 'PENDING' && new Date(r.expiresAt) < new Date();
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/checkout/${r.id}`)}
                      >
                        <td className="px-5 py-3 font-mono text-xs text-zinc-400">{r.id.slice(0, 8)}…</td>
                        <td className="px-5 py-3 font-medium">{r.stockLevel.product.name}</td>
                        <td className="px-5 py-3 text-zinc-500">{r.stockLevel.warehouse.name}</td>
                        <td className="px-5 py-3 text-right">{r.quantity}</td>
                        <td className="px-5 py-3">
                          <span className={cn(
                            'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-sm font-medium',
                            isExpiredPending ? 'bg-red-50 text-red-600 border border-red-200' : STATUS_STYLES[r.status]
                          )}>
                            {isExpiredPending ? <XCircle className="w-3 h-3" /> : STATUS_ICONS[r.status]}
                            {isExpiredPending ? 'EXPIRED' : r.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-zinc-500 text-xs">
                          {r.status === 'PENDING'
                            ? new Date(r.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-zinc-400 text-xs">{timeAgo(r.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-2">Showing last 50 reservations. Auto-refreshes every 15s.</p>
        </section>

      </div>
    </div>
  );
}
