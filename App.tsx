import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ASSET_UNIVERSE,
  DEFAULT_WATCHLIST_IDS,
  FALLBACK_QUOTES,
  type AssetQuote,
  fetchMarketQuotes,
  fetchTradingSignal,
  fetchHistoricalData,
} from './src/lib/tradeApiAdapter';
import {
  type HoldingDraft,
  type PortfolioHolding,
  buildPortfolioSummary,
  upsertHolding,
} from './src/lib/portfolio';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

type PriceSnapshot = {
  time: string;
  [assetId: string]: string | number;
};

function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

const formatPrice = (value: number) => {
  if (value < 1) {
    return `$${value.toFixed(4)}`;
  }

  return currency.format(value);
};

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${percent.format(value)}%`;

const getQuoteMap = (quotes: AssetQuote[]) =>
  Object.fromEntries(quotes.map((quote) => [quote.id, quote]));

const getLastUpdatedLabel = (quotes: AssetQuote[]) => {
  const timestamps = quotes
    .map((quote) => quote.lastUpdatedAt)
    .filter((timestamp): timestamp is number => typeof timestamp === 'number');

  if (timestamps.length === 0) return 'pending';

  return new Date(Math.max(...timestamps) * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const App = () => {
  const [watchlistIds, setWatchlistIds] = useLocalStorage<string[]>(
    'terminal-watchlist-v1',
    DEFAULT_WATCHLIST_IDS,
  );
  const [holdings, setHoldings] = useLocalStorage<PortfolioHolding[]>(
    'terminal-portfolio-v1',
    [
      { assetId: 'EUR', quantity: 1000, averageCost: 1.08 },
      { assetId: 'GBP', quantity: 500, averageCost: 1.27 },
      { assetId: 'GOLD', quantity: 10, averageCost: 2000 },
    ],
  );
  const [selectedAssetId, setSelectedAssetId] = useState(DEFAULT_WATCHLIST_IDS[0]);
  const [quotes, setQuotes] = useState<AssetQuote[]>(FALLBACK_QUOTES);
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [draft, setDraft] = useState<HoldingDraft>({
    assetId: DEFAULT_WATCHLIST_IDS[0],
    quantity: 0,
    averageCost: 0,
  });
  const [priceChartRef, priceChartSize] = useElementSize<HTMLDivElement>();
  const [allocationChartRef, allocationChartSize] = useElementSize<HTMLDivElement>();

  const visibleAssets = useMemo(
    () => ASSET_UNIVERSE.filter((asset) => watchlistIds.includes(asset.id)),
    [watchlistIds],
  );

  const quoteMap = useMemo(() => getQuoteMap(quotes), [quotes]);
  const selectedQuote = quoteMap[selectedAssetId] ?? quotes[0];
  const portfolio = useMemo(() => buildPortfolioSummary(holdings, quoteMap), [holdings, quoteMap]);
  const lastUpdated = useMemo(() => getLastUpdatedLabel(quotes), [quotes]);

  const loadMarketData = useCallback(async () => {
    setIsLoading(true);
    setMarketError(null);

    try {
      const nextQuotes = await fetchMarketQuotes(ASSET_UNIVERSE);
      setQuotes(nextQuotes);
    } catch (error) {
      setMarketError(error instanceof Error ? error.message : 'Market data unavailable');
      setQuotes((current) => (current.length > 0 ? current : FALLBACK_QUOTES));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMarketData();
    const interval = window.setInterval(() => {
      void loadMarketData();
    }, 60000);

    return () => window.clearInterval(interval);
  }, [loadMarketData]);

  useEffect(() => {
    if (quotes.length === 0) return;

    const snapshot: PriceSnapshot = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    for (const quote of quotes) {
      snapshot[quote.id] = quote.price;
    }

    setSnapshots((current) => [...current.slice(-23), snapshot]);
  }, [quotes]);

  const selectedHistory = snapshots.map((snapshot) => ({
    time: snapshot.time,
    price: Number(snapshot[selectedAssetId] ?? selectedQuote?.price ?? 0),
  }));

  const watchlistRows = visibleAssets
    .map((asset) => quoteMap[asset.id])
    .filter((quote): quote is AssetQuote => Boolean(quote));

  const toggleWatchlistAsset = (assetId: string) => {
    setWatchlistIds((current) => {
      if (current.includes(assetId)) {
        if (current.length === 1) return current;
        const next = current.filter((id) => id !== assetId);
        if (assetId === selectedAssetId) setSelectedAssetId(next[0]);
        return next;
      }

      return [...current, assetId];
    });
  };

  const handleDraftChange = (field: keyof HoldingDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: field === 'assetId' ? value : Number(value),
    }));
  };

  const handleSaveHolding = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHoldings((current) => upsertHolding(current, draft));
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-950/95 px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-white">Trading Terminal</h1>
            <p className="mt-1 text-sm text-slate-400">
              Market dashboard for currencies, commodities, and dollar index (168K+ database records).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded border border-slate-700 px-3 py-1 text-slate-300">
              Source: {quotes[0]?.source ?? 'CoinGecko'}
            </span>
            <span className="rounded border border-slate-700 px-3 py-1 text-slate-300">
              Updated: {lastUpdated}
            </span>
            <button
              type="button"
              onClick={() => void loadMarketData()}
              className="rounded bg-cyan-500 px-3 py-1 font-medium text-slate-950 hover:bg-cyan-400"
            >
              {isLoading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 md:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]">
        <section className="grid min-w-0 gap-4">
          {marketError && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {marketError}. Showing cached or fallback prices.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Portfolio Value" value={currency.format(portfolio.totalValue)} />
            <MetricCard
              label="Unrealized P/L"
              value={currency.format(portfolio.totalPnl)}
              tone={portfolio.totalPnl >= 0 ? 'positive' : 'negative'}
            />
            <MetricCard label="Cost Basis" value={currency.format(portfolio.totalCost)} />
            <MetricCard label="Tracked Assets" value={watchlistRows.length.toString()} />
          </div>

          <section className="rounded border border-slate-800 bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-800 p-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm uppercase text-slate-500">{selectedQuote?.symbol ?? 'Asset'}</p>
                <h2 className="mt-1 text-3xl font-semibold text-white">
                  {selectedQuote ? formatPrice(selectedQuote.price) : '$0.00'}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {watchlistRows.map((quote) => (
                  <button
                    key={quote.id}
                    type="button"
                    onClick={() => setSelectedAssetId(quote.id)}
                    className={`rounded px-3 py-2 text-sm font-medium ${
                      selectedAssetId === quote.id
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {quote.symbol}
                  </button>
                ))}
              </div>
            </div>
            <div
              ref={priceChartRef}
              className="relative min-w-0 overflow-hidden"
              style={{ height: 'min(380px, 70vh)', minHeight: 320 }}
            >
              {priceChartSize.width > 24 && priceChartSize.height > 24 && (
                <div className="absolute inset-3">
                  <AreaChart
                    width={priceChartSize.width - 24}
                    height={priceChartSize.height - 24}
                    data={selectedHistory}
                    margin={{ top: 16, right: 12, left: 0, bottom: 0 }}
                  >
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" tickLine={false} fontSize={12} />
                  <YAxis
                    stroke="#64748b"
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tickFormatter={(value) => compactCurrency.format(Number(value))}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                    formatter={(value) => [formatPrice(Number(value)), selectedQuote?.symbol ?? 'Price']}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fill="url(#priceGradient)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
                </div>
              )}
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <h2 className="text-lg font-semibold text-white">Portfolio Tracker</h2>
            </div>
            <div className="grid gap-4 p-4 xl:grid-cols-[1fr_280px]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="pb-3">Asset</th>
                      <th className="pb-3 text-right">Qty</th>
                      <th className="pb-3 text-right">Avg Cost</th>
                      <th className="pb-3 text-right">Value</th>
                      <th className="pb-3 text-right">P/L</th>
                      <th className="pb-3 text-right">Allocation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.rows.map((row) => (
                      <tr key={row.assetId} className="border-t border-slate-800">
                        <td className="py-3">
                          <div className="font-medium text-white">{row.symbol}</div>
                          <div className="text-xs text-slate-500">{row.name}</div>
                        </td>
                        <td className="py-3 text-right">{row.quantity.toLocaleString()}</td>
                        <td className="py-3 text-right">{formatPrice(row.averageCost)}</td>
                        <td className="py-3 text-right">{currency.format(row.value)}</td>
                        <td className={`py-3 text-right ${row.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {currency.format(row.pnl)}
                        </td>
                        <td className="py-3 text-right">{percent.format(row.allocation)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form onSubmit={handleSaveHolding} className="rounded border border-slate-800 bg-slate-950 p-3">
                <label className="block text-xs uppercase text-slate-500" htmlFor="assetId">
                  Asset
                </label>
                <select
                  id="assetId"
                  value={draft.assetId}
                  onChange={(event) => handleDraftChange('assetId', event.target.value)}
                  className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                >
                  {ASSET_UNIVERSE.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.symbol} - {asset.name}
                    </option>
                  ))}
                </select>
                <label className="mt-3 block text-xs uppercase text-slate-500" htmlFor="quantity">
                  Quantity
                </label>
                <input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={draft.quantity}
                  onChange={(event) => handleDraftChange('quantity', event.target.value)}
                  className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
                <label className="mt-3 block text-xs uppercase text-slate-500" htmlFor="averageCost">
                  Average Cost
                </label>
                <input
                  id="averageCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.averageCost}
                  onChange={(event) => handleDraftChange('averageCost', event.target.value)}
                  className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
                <button
                  type="submit"
                  className="mt-4 w-full rounded bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Save Holding
                </button>
              </form>
            </div>
          </section>
        </section>

        <aside className="grid gap-4 lg:content-start">
          <section className="rounded border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <h2 className="text-lg font-semibold text-white">Asset Watchlist</h2>
            </div>
            <div className="divide-y divide-slate-800">
              {watchlistRows.map((quote) => (
                <button
                  key={quote.id}
                  type="button"
                  onClick={() => setSelectedAssetId(quote.id)}
                  className={`grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-3 text-left hover:bg-slate-800 ${
                    selectedAssetId === quote.id ? 'bg-slate-800/80' : ''
                  }`}
                >
                  <span>
                    <span className="block font-medium text-white">{quote.symbol}</span>
                    <span className="block text-xs text-slate-500">{quote.name}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-medium text-white">{formatPrice(quote.price)}</span>
                    <span className={quote.change24h >= 0 ? 'text-xs text-emerald-400' : 'text-xs text-rose-400'}>
                      {formatPercent(quote.change24h)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-2">
              {ASSET_UNIVERSE.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => toggleWatchlistAsset(asset.id)}
                  className={`rounded border px-3 py-2 text-sm ${
                    watchlistIds.includes(asset.id)
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200'
                      : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {asset.symbol}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <h2 className="text-lg font-semibold text-white">Allocation</h2>
            </div>
            <div ref={allocationChartRef} className="relative min-w-0 overflow-hidden" style={{ height: 260 }}>
              {allocationChartSize.width > 24 && allocationChartSize.height > 24 && (
                <div className="absolute inset-3">
                  <BarChart
                    width={allocationChartSize.width - 24}
                    height={allocationChartSize.height - 24}
                    data={portfolio.rows}
                    layout="vertical"
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                  <CartesianGrid stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="symbol" type="category" stroke="#94a3b8" width={48} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                    formatter={(value) => [`${percent.format(Number(value))}%`, 'Allocation']}
                  />
                  <Bar dataKey="allocation" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {portfolio.rows.map((row) => (
                      <Cell key={row.assetId} fill={row.pnl >= 0 ? '#34d399' : '#fb7185'} />
                    ))}
                  </Bar>
                </BarChart>
                </div>
              )}
            </div>
          </section>

          <section className="rounded border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold text-white">Market Data</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Provider</dt>
                <dd className="font-medium text-white">{quotes[0]?.source ?? 'CoinGecko'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Refresh</dt>
                <dd className="font-medium text-white">60s</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Assets</dt>
                <dd className="font-medium text-white">{ASSET_UNIVERSE.length}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </main>
  );
};

const MetricCard = ({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) => {
  const toneClass =
    tone === 'positive' ? 'text-emerald-400' : tone === 'negative' ? 'text-rose-400' : 'text-white';

  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
};

export default App;
