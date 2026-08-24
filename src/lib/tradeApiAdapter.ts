/**
 * Trade API Adapter
 * Adapts the existing trade API to work with Trading Terminal's expected data structure
 */

// Use relative path - works both in development (through Vite proxy) and production (through Caddy)
// In production: /apps/trade/terminal/api/trade -> proxied to trade-api:8000
// In development: /api/trade -> proxied to http://tony-omen.local:8080/apps/trade/api
const API_BASE_URL = '/api/trade';

export type AssetCategory = 'currency' | 'commodity' | 'dollar_index';

export type AssetDefinition = {
  id: string;
  symbol: string;
  name: string;
  category: AssetCategory;
};

export type AssetQuote = AssetDefinition & {
  price: number;
  change24h: number;
  volume24h: number;
  lastUpdatedAt?: number;
  source: 'TradeAPI' | 'Fallback';
};

export type TradingSignal = {
  signal_type: 'buy' | 'sell' | 'hold';
  strength: 'weak' | 'moderate' | 'strong';
  confidence: number;
  timestamp: string;
  price: number;
  indicators: Record<string, any>;
  reasons: string[];
  timeframe: string;
};

// Asset universe matching our database
export const ASSET_UNIVERSE: AssetDefinition[] = [
  // Currencies
  { id: 'EUR', symbol: 'EUR', name: 'Euro', category: 'currency' },
  { id: 'GBP', symbol: 'GBP', name: 'British Pound', category: 'currency' },
  { id: 'JPY', symbol: 'JPY', name: 'Japanese Yen', category: 'currency' },
  { id: 'CHF', symbol: 'CHF', name: 'Swiss Franc', category: 'currency' },
  { id: 'CAD', symbol: 'CAD', name: 'Canadian Dollar', category: 'currency' },
  { id: 'AUD', symbol: 'AUD', name: 'Australian Dollar', category: 'currency' },
  { id: 'NZD', symbol: 'NZD', name: 'New Zealand Dollar', category: 'currency' },
  { id: 'CNY', symbol: 'CNY', name: 'Chinese Yuan', category: 'currency' },
  { id: 'INR', symbol: 'INR', name: 'Indian Rupee', category: 'currency' },
  { id: 'MXN', symbol: 'MXN', name: 'Mexican Peso', category: 'currency' },
  { id: 'BRL', symbol: 'BRL', name: 'Brazilian Real', category: 'currency' },
  { id: 'KRW', symbol: 'KRW', name: 'South Korean Won', category: 'currency' },
  { id: 'SGD', symbol: 'SGD', name: 'Singapore Dollar', category: 'currency' },
  { id: 'HKD', symbol: 'HKD', name: 'Hong Kong Dollar', category: 'currency' },
  { id: 'NOK', symbol: 'NOK', name: 'Norwegian Krone', category: 'currency' },
  { id: 'SEK', symbol: 'SEK', name: 'Swedish Krona', category: 'currency' },
  { id: 'DKK', symbol: 'DKK', name: 'Danish Krone', category: 'currency' },
  { id: 'PLN', symbol: 'PLN', name: 'Polish Zloty', category: 'currency' },
  { id: 'TRY', symbol: 'TRY', name: 'Turkish Lira', category: 'currency' },
  { id: 'ZAR', symbol: 'ZAR', name: 'South African Rand', category: 'currency' },
  { id: 'RON', symbol: 'RON', name: 'Romanian Leu', category: 'currency' },
  { id: 'HUF', symbol: 'HUF', name: 'Hungarian Forint', category: 'currency' },
  // Commodities
  { id: 'OIL', symbol: 'OIL', name: 'Crude Oil', category: 'commodity' },
  { id: 'GOLD', symbol: 'GOLD', name: 'Gold', category: 'commodity' },
  { id: 'SILVER', symbol: 'SILVER', name: 'Silver', category: 'commodity' },
  { id: 'COPPER', symbol: 'COPPER', name: 'Copper', category: 'commodity' },
  // Dollar Index
  { id: 'DXY', symbol: 'DXY', name: 'Dollar Index', category: 'dollar_index' },
];

export const DEFAULT_WATCHLIST_IDS = ['EUR', 'GBP', 'JPY', 'GOLD', 'OIL', 'DXY'];

export const FALLBACK_QUOTES: AssetQuote[] = [
  { ...ASSET_UNIVERSE[0], price: 0.92, change24h: 0.15, volume24h: 0, source: 'Fallback' },
  { ...ASSET_UNIVERSE[1], price: 0.79, change24h: -0.25, volume24h: 0, source: 'Fallback' },
  { ...ASSET_UNIVERSE[2], price: 151.2, change24h: 0.35, volume24h: 0, source: 'Fallback' },
  { ...ASSET_UNIVERSE[22], price: 2050.50, change24h: 0.45, volume24h: 0, source: 'Fallback' },
  { ...ASSET_UNIVERSE[21], price: 78.50, change24h: -0.65, volume24h: 0, source: 'Fallback' },
  { ...ASSET_UNIVERSE[25], price: 102.5, change24h: 0.12, volume24h: 0, source: 'Fallback' },
];

/**
 * Fetch exchange rate data from the trade API
 */
async function fetchExchangeRate(currency: string): Promise<any> {
  try {
    // Try to get recent data with period query first
    let response = await fetch(`${API_BASE_URL}/api/exchange_rates/${currency}?period=1d&limit=2`);
    if (!response.ok) throw new Error(`API request failed with ${response.status}`);
    let data = await response.json();

    // If no data returned, fall back to latest endpoint
    if (!data.data || data.data.length === 0) {
      response = await fetch(`${API_BASE_URL}/api/exchange_rates/${currency}/latest`);
      if (!response.ok) throw new Error(`Latest API request failed with ${response.status}`);
      const latestData = await response.json();
      // Format as array for consistency
      data = { data: [latestData], count: 1, limit: 1, offset: 0, has_more: false };
    }

    return data;
  } catch (error) {
    console.error(`Error fetching exchange rate for ${currency}:`, error);
    return null;
  }
}

/**
 * Fetch commodity price data from the trade API
 */
async function fetchCommodityPrice(commodity: string): Promise<any> {
  try {
    // Try to get recent data with period query first
    let response = await fetch(`${API_BASE_URL}/api/commodity_prices/${commodity}?period=1d&limit=2`);
    if (!response.ok) throw new Error(`API request failed with ${response.status}`);
    let data = await response.json();

    // If no data returned, fall back to latest endpoint
    if (!data.data || data.data.length === 0) {
      response = await fetch(`${API_BASE_URL}/api/commodity_prices/${commodity}/latest`);
      if (!response.ok) throw new Error(`Latest API request failed with ${response.status}`);
      const latestData = await response.json();
      // Format as array for consistency
      data = { data: [latestData], count: 1, limit: 1, offset: 0, has_more: false };
    }

    return data;
  } catch (error) {
    console.error(`Error fetching commodity price for ${commodity}:`, error);
    return null;
  }
}

/**
 * Fetch dollar index data from the trade API
 */
async function fetchDollarIndex(): Promise<any> {
  try {
    // Try to get recent data with period query first
    let response = await fetch(`${API_BASE_URL}/api/dollar_index?period=1d&limit=2`);
    if (!response.ok) throw new Error(`API request failed with ${response.status}`);
    let data = await response.json();

    // If no data returned, fall back to latest endpoint
    if (!data.data || data.data.length === 0) {
      response = await fetch(`${API_BASE_URL}/api/dollar_index/latest`);
      if (!response.ok) throw new Error(`Latest API request failed with ${response.status}`);
      const latestData = await response.json();
      // Format as array for consistency
      data = { data: [latestData], count: 1, limit: 1, offset: 0, has_more: false };
    }

    return data;
  } catch (error) {
    console.error('Error fetching dollar index:', error);
    return null;
  }
}

/**
 * Calculate 24h change from two data points
 */
function calculate24hChange(current: number, previous: number): number {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Map API response to AssetQuote format
 */
function mapToAssetQuote(asset: AssetDefinition, apiData: any): AssetQuote | null {
  if (!apiData || !apiData.data || apiData.data.length === 0) return null;

  const dataPoints = apiData.data;
  const latest = dataPoints[0];
  const previous = dataPoints.length > 1 ? dataPoints[1] : null;

  const price = latest.close || latest.rate || latest.value || latest.price;
  const previousPrice = previous?.close || previous?.rate || previous?.value || previous?.price;

  return {
    ...asset,
    price,
    change24h: calculate24hChange(price, previousPrice),
    volume24h: latest.volume || 0,
    lastUpdatedAt: latest.date ? new Date(latest.date).getTime() : undefined,
    source: 'TradeAPI',
  };
}

/**
 * Fetch trading signals for an asset
 * Note: This requires sufficient historical data (50+ data points) and may return 404 if data is insufficient
 */
export async function fetchTradingSignal(asset: AssetDefinition): Promise<TradingSignal | null> {
  try {
    let endpoint = '';
    if (asset.category === 'currency') {
      endpoint = `${API_BASE_URL}/api/signals/${asset.id}`;
    } else if (asset.category === 'commodity') {
      endpoint = `${API_BASE_URL}/api/signals/commodity/${asset.id}`;
    } else if (asset.category === 'dollar_index') {
      endpoint = `${API_BASE_URL}/api/signals/dollar_index`;
    }

    const response = await fetch(endpoint);
    if (!response.ok) {
      // 404 is expected if insufficient data - log but don't throw
      if (response.status === 404) {
        console.log(`Insufficient data for signal generation: ${asset.id}`);
      } else {
        console.error(`Signal API request failed with ${response.status}`);
      }
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching trading signal for ${asset.id}:`, error);
    return null;
  }
}

/**
 * Fetch market quotes for multiple assets from the trade API
 */
export const fetchMarketQuotes = async (assets: AssetDefinition[]): Promise<AssetQuote[]> => {
  const quotes: AssetQuote[] = [];
  const errors: string[] = [];

  // Process assets in parallel
  const promises = assets.map(async (asset) => {
    let apiData = null;

    if (asset.category === 'currency') {
      apiData = await fetchExchangeRate(asset.id);
    } else if (asset.category === 'commodity') {
      apiData = await fetchCommodityPrice(asset.id);
    } else if (asset.category === 'dollar_index') {
      apiData = await fetchDollarIndex();
    }

    if (apiData) {
      const quote = mapToAssetQuote(asset, apiData);
      if (quote) return quote;
    }

    errors.push(`Failed to fetch data for ${asset.id}`);
    return null;
  });

  const results = await Promise.all(promises);

  // Filter out null results and add successful quotes
  results.forEach((result) => {
    if (result) quotes.push(result);
  });

  // If we got some data but not all, log warnings
  if (quotes.length > 0 && errors.length > 0) {
    console.warn('Partial data fetch:', errors);
  }

  // If no data was retrieved, use fallback
  if (quotes.length === 0) {
    console.warn('No data retrieved from API, using fallback quotes');
    return FALLBACK_QUOTES.filter(fallback => 
      assets.some(asset => asset.id === fallback.id)
    );
  }

  return quotes;
};

/**
 * Fetch historical data for an asset
 */
export async function fetchHistoricalData(
  asset: AssetDefinition,
  period: string = '1y'
): Promise<any[]> {
  try {
    let endpoint = '';
    if (asset.category === 'currency') {
      endpoint = `${API_BASE_URL}/api/exchange_rates/${asset.id}?period=${period}`;
    } else if (asset.category === 'commodity') {
      endpoint = `${API_BASE_URL}/api/commodity_prices/${asset.id}?period=${period}`;
    } else if (asset.category === 'dollar_index') {
      endpoint = `${API_BASE_URL}/api/dollar_index?period=${period}`;
    }

    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Historical data request failed with ${response.status}`);
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error(`Error fetching historical data for ${asset.id}:`, error);
    return [];
  }
}

/**
 * Get available currencies from the API
 */
export async function getAvailableCurrencies(): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/available/currencies`);
    if (!response.ok) throw new Error(`Currencies request failed with ${response.status}`);
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching available currencies:', error);
    return [];
  }
}

/**
 * Get available commodities from the API
 */
export async function getAvailableCommodities(): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/available/commodities`);
    if (!response.ok) throw new Error(`Commodities request failed with ${response.status}`);
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching available commodities:', error);
    return [];
  }
}
