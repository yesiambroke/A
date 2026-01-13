'use client';

import React from 'react';
import Link from 'next/link';

// Custom Navigation Icons
const ScreenerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
    <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="2"/>
    <line x1="6" y1="11" x2="10" y2="11" stroke="currentColor" strokeWidth="2"/>
    <line x1="6" y1="13" x2="14" y2="13" stroke="currentColor" strokeWidth="2"/>
    <line x1="6" y1="15" x2="12" y2="15" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

const ReferralIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
    <path d="M19 8v6m3-3h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m16.24-3.76l-4.24 4.24m-6-6L3.76 7.76m16.24 6.24l-4.24-4.24m-6 6L7.76 20.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
  </svg>
);

type OperatorProps = {
  userId: number;
  tier: string;
  is2faEnabled: boolean;
};

type PageHeaderProps = {
  currentPage: 'screener' | 'referral' | 'settings' | 'upgrade' | 'terminal';
  operator: OperatorProps | null;
};

const PageHeader = ({ currentPage, operator }: PageHeaderProps) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [telegramUrl, setTelegramUrl] = React.useState('https://t.me/a_trade_dot_fun_bot');
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Set Telegram URL with referral code on client side
  React.useEffect(() => {
    const refCode = localStorage.getItem('referralCode');
    const baseUrl = 'https://t.me/a_trade_dot_fun_bot';
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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      window.location.href = '/';
    }
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
        <Link
          href="/screener"
          className={`flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold transition-all duration-200 relative ${
            currentPage === 'screener'
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
        <Link
          href="/referral"
          className={`flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold transition-all duration-200 relative ${
            currentPage === 'referral'
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
         <Link
           href="/upgrade"
           className={`flex items-center gap-2 border px-3 py-2 text-[11px] font-semibold transition-all duration-200 relative ${
             currentPage === 'upgrade'
               ? 'border-green-400 bg-green-500/10 text-black shadow-md shadow-green-500/30'
               : 'border-black/50 bg-black/20 text-green-400 hover:bg-black/30 hover:border-green-500/50'
           }`}
         >
           <span className="text-green-500">▲</span>
           <span className="hidden sm:inline">Upgrade</span>
           {currentPage === 'upgrade' && (
             <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-3 h-0.5 bg-green-400 rounded-full"></div>
           )}
         </Link>

        {/* Profile Menu */}
        {operator ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 border border-black/50 bg-black/20 px-3 py-2 text-[11px] font-semibold hover:bg-black/30 hover:border-green-500/50 transition-all duration-200"
            >
              <ProfileIcon />
              <span className="hidden sm:inline">#{operator.userId}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-44 border border-green-500 bg-black text-green-200 shadow-lg shadow-green-500/30">
                <div className="px-3 py-2 text-xs border-b border-green-500/30">
                  <div className="font-semibold">User #{operator.userId}</div>
                  <div className="text-green-400/80">Tier: {operator.tier.toUpperCase()}</div>
                  <div className="text-green-400/80">2FA: {operator.is2faEnabled ? 'Enabled' : 'Disabled'}</div>
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
            <span className="hidden sm:inline">START TRADING</span>
          </Link>
        )}
      </div>
    </div>
  );
};

export default PageHeader;