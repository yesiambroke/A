'use client';

import React from 'react';
import Link from 'next/link';

// Custom Navigation Icons
const ScreenerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
    <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="2" />
    <line x1="6" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="2" />
    <line x1="6" y1="13" x2="14" y2="13" stroke="currentColor" strokeWidth="2" />
    <line x1="6" y1="15" x2="12" y2="15" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const LaunchpadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ReferralIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M19 8v6m3-3h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m16.24-3.76l-4.24 4.24m-6-6L3.76 7.76m16.24 6.24l-4.24-4.24m-6 6L7.76 20.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
    <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

type OperatorProps = {
  accountId: string;
  userTier: string;
  is2faEnabled: boolean;
};

type PageHeaderProps = {
  currentPage: 'screener' | 'referral' | 'launchpad' | 'settings' | 'upgrade' | 'terminal';
  operator: OperatorProps | null;
};

const PageHeader = ({ currentPage, operator }: PageHeaderProps) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [telegramUrl, setTelegramUrl] = React.useState('https://t.me/a_trade_fun_bot');
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Search state
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [solPrice, setSolPrice] = React.useState<number>(0);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const searchModalRef = React.useRef<HTMLDivElement>(null);

  // Market Relay API URL (same pattern as TradingTerminal)
  const MARKET_RELAY_API_URL =
    process.env.NEXT_PUBLIC_MARKET_RELAY_API_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://token-api.a-trade.fun' : 'http://localhost:8082');

  // Set Telegram URL with referral code on client side
  React.useEffect(() => {
    const refCode = localStorage.getItem('referralCode');
    const baseUrl = 'https://t.me/a_trade_fun_bot';
    setTelegramUrl(refCode ? `${baseUrl}?start=${refCode}` : baseUrl);
  }, []);

  React.useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Price formatting utility
  const formatPrice = (val: number) => {
    if (!val || val === 0) return '$0';
    if (val >= 1e9) return `$${(val / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  // Handle search logic
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (searchModalRef.current && !searchModalRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };

    if (searchOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
      // Focus search input when modal opens
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [searchOpen]);

  // Debounced search
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `${MARKET_RELAY_API_URL}/api/search?query=${encodeURIComponent(searchQuery)}`
        );
        const data = await response.json();
        if (data.success) {
          setSearchResults(data.results || []);
          if (data.solPrice) setSolPrice(data.solPrice);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, MARKET_RELAY_API_URL]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      window.location.href = '/';
    }
  };

  const handleSearchResultClick = (tokenAddress: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    window.location.href = `/terminal?coin=${tokenAddress}`;
  };

  const getPageTitle = () => {
    switch (currentPage) {
      case 'screener':
        return 'A-TRADE://screener';
      case 'referral':
        return 'A-TRADE://referral';
      case 'settings':
        return 'A-TRADE://settings';
      case 'upgrade':
        return 'A-TRADE://upgrade';
      case 'launchpad':
        return 'A-TRADE://launchpad';
      case 'terminal':
        return 'A-TRADE://terminal';
      default:
        return 'A-TRADE://terminal';
    }
  };



  return (
    <div className="relative bg-green-500 px-2 py-1 sm:px-4 flex items-center gap-2 sticky top-0 z-20">
      <div className="flex gap-1">
        <div className="relative w-3 h-4 animate-card-flip" style={{ transformStyle: 'preserve-3d' }}>
          <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[6px] font-bold text-black" style={{ backfaceVisibility: 'hidden' }}>♠</div>
          <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[6px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♥</div>
        </div>
        <div className="relative w-3 h-4 animate-card-flip" style={{ transformStyle: 'preserve-3d', animationDelay: '0.7s' }}>
          <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[6px] font-bold text-black" style={{ backfaceVisibility: 'hidden' }}>♥</div>
          <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[6px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♣</div>
        </div>
        <div className="relative w-3 h-4 animate-card-flip" style={{ transformStyle: 'preserve-3d', animationDelay: '1.4s' }}>
          <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[6px] font-bold text-black" style={{ backfaceVisibility: 'hidden' }}>♣</div>
          <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[6px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♦</div>
        </div>
      </div>

      <span className="text-black font-bold text-xs sm:text-sm truncate">
        {getPageTitle()}
      </span>

      <div className="ml-auto flex items-center gap-2 text-xs text-black">
        {/* Navigation Buttons */}
        {/* Search Button */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 border border-black/50 bg-black/20 px-3 py-2 text-[11px] font-semibold hover:bg-black/30 hover:border-green-500/50 transition-all duration-200 text-green-400"
          title="Search tokens"
        >
          <SearchIcon />
          <span className="hidden sm:inline">Search</span>
        </button>

        <Link
          href="/screener"
          className={`flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold transition-all duration-200 relative ${currentPage === 'screener'
            ? 'border-green-400 bg-green-500/10 text-black shadow-md shadow-green-500/30'
            : 'border-black/50 bg-black/20 text-green-400 hover:bg-black/30 hover:border-green-500/50'
            }`}
        >
          <ScreenerIcon />
          <span className="hidden sm:inline">Screener</span>
          {currentPage === 'screener' && (
            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-0.5 bg-green-400 rounded-full"></div>
          )}
        </Link>
        {operator && (
          <Link
            href="/launchpad"
            className={`flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold transition-all duration-200 relative ${currentPage === 'launchpad'
              ? 'border-green-400 bg-green-500/10 text-black shadow-md shadow-green-500/30'
              : 'border-black/50 bg-black/20 text-green-400 hover:bg-black/30 hover:border-green-500/50'
              }`}
          >
            <LaunchpadIcon />
            <span className="hidden sm:inline">Launchpad</span>
            {currentPage === 'launchpad' && (
              <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-0.5 bg-green-400 rounded-full"></div>
            )}
          </Link>
        )}
        <Link
          href="/referral"
          className={`flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold transition-all duration-200 relative ${currentPage === 'referral'
            ? 'border-green-400 bg-green-500/10 text-black shadow-md shadow-green-500/30'
            : 'border-black/50 bg-black/20 text-green-400 hover:bg-black/30 hover:border-green-500/50'
            }`}
        >
          <ReferralIcon />
          <span className="hidden sm:inline">Referral</span>
          {currentPage === 'referral' && (
            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-0.5 bg-green-400 rounded-full"></div>
          )}
        </Link>
        {operator && operator.userTier !== 'pro' && (
          <Link
            href="/upgrade"
            className={`flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold transition-all duration-200 relative ${currentPage === 'upgrade'
              ? 'border-green-400 bg-green-500/10 text-black shadow-md shadow-green-500/30'
              : 'border-black/50 bg-black/20 text-green-400 hover:bg-black/30 hover:border-green-500/50'
              }`}
          >
            <span className="text-green-500">▲</span>
            <span className="hidden sm:inline">Upgrade</span>
            {operator.userTier === 'basic' && currentPage !== 'upgrade' && (
              <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-0.5 bg-green-400 rounded-full"></div>
            )}
          </Link>
        )}

        {/* Profile Menu */}
        {operator ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 border border-black/50 bg-black/20 px-3 py-2 text-[11px] font-semibold hover:bg-black/30 hover:border-green-500/50 transition-all duration-200"
            >
              <ProfileIcon />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-44 border border-green-500 bg-black text-green-200 shadow-lg shadow-green-500/30">
                <div className="px-3 py-2 text-xs border-b border-green-500/30">
                  <div className="text-green-400/80 text-[10px]">Tier: {operator.userTier?.toUpperCase() || 'BASIC'}</div>
                  <div className="text-green-400/80 text-[10px]">2FA: {operator.is2faEnabled ? 'Enabled' : 'Disabled'}</div>
                </div>
                <Link
                  href="/settings"
                  className="block px-3 py-2 text-sm hover:bg-green-500/10"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="text-green-500 mr-2">⚙</span> Settings
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-green-500/10 text-red-400 hover:text-red-300"
                >
                  <span className="text-red-400 mr-2">⏏</span> Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border border-black/50 bg-black/20 px-3 py-2 text-[11px] font-semibold hover:bg-black/30 hover:border-green-500/50 transition-all duration-200"
          >
            <ProfileIcon />
            <span className="hidden sm:inline text-green-400">START TRADING</span>
          </Link>
        )}
      </div>

      {/* Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-start justify-center pt-20 px-4">
          <div
            ref={searchModalRef}
            className="w-full max-w-2xl bg-black border-2 border-green-500 shadow-2xl shadow-green-500/30"
          >
            {/* Search Input */}
            <div className="p-4 border-b border-green-500/30">
              <div className="flex items-center gap-2">
                <SearchIcon />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Paste token contract address..."
                  className="flex-1 bg-transparent text-green-400 placeholder-green-400/50 outline-none text-lg font-mono"
                />
                <button
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="text-green-400 hover:text-green-300 text-sm px-2 py-1 border border-green-500/30 hover:border-green-500"
                >
                  ESC
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="max-h-96 overflow-y-auto">
              {isSearching ? (
                <div className="p-8 text-center text-green-400">
                  <div className="animate-pulse">Searching...</div>
                </div>
              ) : searchQuery.trim() && searchResults.length === 0 ? (
                <div className="p-8 text-center text-green-400/70">
                  No Pump tokens found
                </div>
              ) : searchResults.length > 0 ? (
                <div className="p-2">
                  <div className="text-xs text-green-400/70 px-3 py-2 border-b border-green-500/20">
                    Results
                  </div>
                  {searchResults.map((result) => (
                    <button
                      key={result.tokenAddress}
                      onClick={() => handleSearchResultClick(result.tokenAddress)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-green-500/10 border-b border-green-500/10 transition-colors text-left"
                    >
                      {/* Token Image */}
                      <img
                        src={result.tokenImage}
                        alt={result.tokenName}
                        className="w-12 h-12 rounded border border-green-500/30"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="48" height="48"%3E%3Crect fill="%23000" width="48" height="48"/%3E%3C/svg%3E';
                        }}
                      />

                      {/* Token Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-green-400 truncate">
                            {result.tokenName}
                          </span>
                          <span className="text-green-400/70 text-sm">
                            {result.tokenTicker}
                          </span>
                        </div>
                        <div className="text-xs text-green-400/50 font-mono truncate">
                          {result.tokenAddress}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex gap-4 text-xs">
                        {/* Market Cap Calculation: (liquiditySol / liquidityToken) * supply * solPrice */}
                        <div className="text-right">
                          <div className="text-green-400/70">MC</div>
                          <div className="text-green-400 font-semibold text-[10px] sm:text-xs">
                            {result.liquidityToken > 0 && solPrice > 0
                              ? formatPrice(((result.liquiditySol / result.liquidityToken) * result.supply * solPrice))
                              : "$0"
                            }
                          </div>
                        </div>

                        {/* Volume Calculation: volumeSol * solPrice */}
                        <div className="text-right">
                          <div className="text-green-400/70">V</div>
                          <div className="text-green-400 font-semibold text-[10px] sm:text-xs">
                            {solPrice > 0
                              ? formatPrice(result.volumeSol * solPrice)
                              : "$0"
                            }
                          </div>
                        </div>

                        {/* Liquidity in SOL */}
                        <div className="text-right">
                          <div className="text-green-400/70">L</div>
                          <div className="text-green-400 font-semibold text-[10px] sm:text-xs">
                            {result.liquiditySol.toFixed(0)} SOL
                          </div>
                        </div>
                      </div>

                      {/* No Icon */}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PageHeader;