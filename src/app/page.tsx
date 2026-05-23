'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, MapPin, Activity } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WarehouseStock {
  id: string;
  warehouseId: string;
  warehouseName: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stockLevels: WarehouseStock[];
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const router = useRouter();

  const loadData = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) setProducts(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleQuantityChange = (stockLevelId: string, qty: number, max: number) => {
    if (qty > max) qty = max;
    if (qty < 1) qty = 1;
    setQuantities(prev => ({ ...prev, [stockLevelId]: qty }));
  };

  const reserveStock = async (stockLevelId: string) => {
    const quantity = quantities[stockLevelId] || 1;
    const loadingToastId = toast.loading('Securing inventory...');
    
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({ stockLevelId, quantity }),
    });
    
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || 'Failed to reserve stock', { id: loadingToastId });
      if (res.status === 409) loadData(); // refresh stock on conflict
      return;
    }
    
    toast.success(`Successfully reserved ${quantity} units!`, { id: loadingToastId });
    router.push(`/checkout/${data.id}`);
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        
        <header className="flex justify-between items-center mb-16 pb-4 border-b border-zinc-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">allo.</h1>
            <p className="text-sm text-zinc-500 mt-1">D2C Inventory Demo</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => router.push('/admin')}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-2"
            >
              <Activity className="w-4 h-4" /> Admin
            </button>
            <ShoppingCart className="w-5 h-5 text-zinc-400" />
          </div>
        </header>

        <div className="grid gap-8">
          {products.map(product => (
            <div key={product.id} className="border border-zinc-200 bg-white p-6 flex flex-col md:flex-row gap-6 shadow-sm hover:shadow-md transition-shadow">
              {product.imageUrl && (
                <div className="w-full md:w-48 h-48 bg-zinc-100 flex-shrink-0">
                  <img 
                    src={product.imageUrl} 
                    alt={product.name} 
                    className="w-full h-full object-cover mix-blend-multiply" 
                  />
                </div>
              )}
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h2 className="text-lg font-medium">{product.name}</h2>
                  <span className="text-sm font-medium">${product.price}</span>
                </div>
                <p className="text-sm text-zinc-500 mt-2">{product.description}</p>
                
                <div className="mt-8 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-2">Availability</div>
                  {product.stockLevels.map(sl => (
                    <div key={sl.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-t border-zinc-100 last:border-b gap-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm text-zinc-700 font-medium">{sl.warehouseName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "text-sm whitespace-nowrap", 
                          sl.availableUnits > 0 ? "text-zinc-900" : "text-zinc-400"
                        )}>
                          {sl.availableUnits} left
                        </span>
                        
                        {sl.availableUnits > 0 && (
                          <div className="flex items-center border border-zinc-200 rounded-sm">
                            <button 
                              className="px-2 py-1 text-zinc-500 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border-r border-zinc-200"
                              onClick={() => handleQuantityChange(sl.id, (quantities[sl.id] || 1) - 1, sl.availableUnits)}
                            >-</button>
                            <input 
                              type="number"
                              min="1"
                              max={sl.availableUnits}
                              value={quantities[sl.id] || 1}
                              onChange={(e) => handleQuantityChange(sl.id, parseInt(e.target.value) || 1, sl.availableUnits)}
                              className="w-12 text-center text-sm py-1 appearance-none focus:outline-none"
                            />
                            <button 
                              className="px-2 py-1 text-zinc-500 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border-l border-zinc-200"
                              onClick={() => handleQuantityChange(sl.id, (quantities[sl.id] || 1) + 1, sl.availableUnits)}
                            >+</button>
                          </div>
                        )}

                        <button
                          onClick={() => reserveStock(sl.id)}
                          disabled={sl.availableUnits === 0}
                          className={cn(
                            "text-sm px-4 py-1.5 border rounded-sm font-medium",
                            sl.availableUnits > 0 
                              ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 transition-colors" 
                              : "border-zinc-200 bg-zinc-50 text-zinc-400 cursor-not-allowed"
                          )}
                        >
                          Reserve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
