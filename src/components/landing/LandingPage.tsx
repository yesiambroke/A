'use client'
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState } from 'react'

const suits = [
  { symbol: '♠', color: 'text-green-400', name: 'spades' },
  { symbol: '♥', color: 'text-green-400', name: 'hearts' },
  { symbol: '♣', color: 'text-green-400', name: 'clubs' },
  { symbol: '♦', color: 'text-green-400', name: 'diamonds' }
]

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 sm:w-6 sm:h-6">
        <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Lightning Fast',
    desc: 'Execute trades in milliseconds',
    cmd: '> execute --speed=ultra'
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 sm:w-6 sm:h-6">
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M7 12l4-4 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Real-Time Analytics',
    desc: 'Advanced charting and portfolio analytics',
    cmd: '> analytics --live=true'
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 sm:w-6 sm:h-6">
        <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Native Non-Custodial Wallet',
    desc: 'Full control, designed for our trading ecosystem.',
    cmd: '> wallet --type=non-custodial'
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 sm:w-6 sm:h-6">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Low Trading Fees',
    desc: 'Enjoy low trading fees — as low as 0.222%',
    cmd: '> fees --pro=0.222% --basic=0.444%'
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 sm:w-6 sm:h-6">
        <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
    title: 'Easy Multi Wallet Control',
    desc: 'Manage up to 100 active wallets simultaneously',
    cmd: '> wallet --max=100'
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 sm:w-6 sm:h-6">
        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M6 8h12M6 12h12M6 16h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    title: 'Advanced Trading Terminal',
    desc: 'Professional terminal interface with advanced tools',
    cmd: '> terminal --mode=advanced'
  }
]

const steps = [
  { step: '01', title: 'Get Started', desc: 'Authenticate via Telegram bot to receive your secure access token', cmd: '$ tg --bot @a_trade_fun_bot' },
  { step: '02', title: 'Download A-Wallet', desc: 'Download and install A-Wallet, our in-house Solana wallet app (available for Mac and Windows), to securely manage your private keys.', cmd: '$ wallet --non-custodial' },
  { step: '03', title: 'Connect Your Wallet', desc: 'Connect A-Wallet to the A-Trade platform to start trading seamlessly.', cmd: '$ connect --platform=a-trade' },
  { step: '04', title: 'Start Trading', desc: 'Trade with peace of mind with as low as 0.222% fees using our advanced terminal interface', cmd: '$ trade --execute' }
]

const faqs = [
  { q: 'What is a-trade.fun?', a: 'A-Trade is a non-custodial trading terminal. You hold your own private keys through A-Wallet, so you remain in full control while trading seamlessly on our platform.' },
  { q: 'How do I get started?', a: 'Authenticate via our Telegram bot (@a_trade_fun_bot) to receive your secure access token. Telegram provides an extra layer of security for authentication.' },
  { q: 'What are the trading fees?', a: 'Pay as little as 0.222% per trade with Pro — half the cost of Basic (0.444%). Upgrade to save more on every transaction.' },
  { q: 'What is A-Wallet?', a: 'A-Wallet is our in-house Solana wallet that integrates seamlessly with A-Trade. It’s non-custodial, which means you remain in full control of your private keys and assets at all times. Transactions are signed locally within the wallet and sent securely to the network, giving you a safe and smooth trading experience.' },
  { q: 'How does A-Wallet work?', a: 'A-Wallet signs transactions locally during an active session with our platform. Signed transactions are sent for execution, and you can disconnect the wallet at any time to revoke access.' }
]

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currentSuitIndex, setCurrentSuitIndex] = useState(0)
  const [telegramUrl, setTelegramUrl] = useState('https://t.me/a_trade_fun_bot')

  // Handle referral code from URL and set Telegram URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      // Save referral code to localStorage for TG bot links
      localStorage.setItem('referralCode', refCode);
      // Clean URL by removing ref parameter
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.pathname + url.hash);
    }

    // Set Telegram URL with referral code if available
    const storedRefCode = localStorage.getItem('referralCode');
    const baseUrl = 'https://t.me/a_trade_fun_bot';
    setTelegramUrl(storedRefCode ? `${baseUrl}?start=${storedRefCode}` : baseUrl);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSuitIndex((prev) => (prev + 1) % suits.length)
    }, 4000)

    return () => clearInterval(interval)
  }, [])



  const currentSuit = suits[currentSuitIndex]



  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-2 sm:p-4 md:p-8 font-mono">
      <div className="fixed inset-0 pointer-events-none opacity-10 z-50">
        <div className="absolute inset-0" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.1) 2px, rgba(0,255,0,0.1) 4px)'
        }} />
      </div>

      <div className="relative z-10 max-w-6xl w-full">
        <div className="border-2 border-green-500 bg-black shadow-2xl shadow-green-500/20 relative">
          <div className="bg-green-500 px-2 sm:px-4 py-2 flex items-center gap-1 sm:gap-2 sticky top-0 z-20">
            <div className="flex gap-1 sm:gap-1.5 flex-shrink-0">
              <div className="relative w-3 h-4 sm:w-4 sm:h-5 animate-card-flip" style={{ transformStyle: 'preserve-3d' }}>
                <div className="absolute inset-0 bg-black border border-black rounded-sm flex items-center justify-center text-[6px] sm:text-[8px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden' }}>♠</div>
                <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[6px] sm:text-[8px] font-bold text-black" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♥</div>
              </div>
              <div className="relative w-3 h-4 sm:w-4 sm:h-5 animate-card-flip" style={{ transformStyle: 'preserve-3d', animationDelay: '0.7s' }}>
                <div className="absolute inset-0 bg-black border border-black rounded-sm flex items-center justify-center text-[6px] sm:text-[8px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden' }}>♥</div>
                <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[6px] sm:text-[8px] font-bold text-black" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♣</div>
              </div>
              <div className="relative w-3 h-4 sm:w-4 sm:h-5 animate-card-flip" style={{ transformStyle: 'preserve-3d', animationDelay: '1.4s' }}>
                <div className="absolute inset-0 bg-black border border-black rounded-sm flex items-center justify-center text-[6px] sm:text-[8px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden' }}>♣</div>
                <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[6px] sm:text-[8px] font-bold text-black" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♦</div>
              </div>
            </div>
            <span className="text-black font-bold text-xs sm:text-sm truncate">A-TRADE://a-trade.fun</span>
            <div className="hidden md:flex ml-auto gap-2 text-xs text-black items-center">
              <a href="#features" className="hover:underline px-1">FEATURES</a>
              <a href="#how-it-works" className="hover:underline px-1">HOW TO START</a>
              <a href="#a-wallet" className="hover:underline px-1">A-WALLET</a>
              <a href="#faq" className="hover:underline px-1">FAQ</a>
              <a href="/screener" target="_blank" rel="noopener noreferrer" className="hover:underline px-1">LAUNCH APP</a>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 hover:opacity-80 transition-opacity"
                aria-label="Telegram"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                </svg>
              </a>
              <a
                href="https://x.com/a_trade_fun"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 hover:opacity-80 transition-opacity"
                aria-label="X (Twitter)"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M4 4h4.6l3.4 4.6L15.6 4H20l-5.4 6.9L20 20h-4.6l-3.6-4.9L8.4 20H4l5.6-7L4 4Z" />
                </svg>
              </a>
            </div>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden ml-auto text-black font-bold text-lg px-2"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden bg-green-500/95 border-b-2 border-green-600">
              <div className="flex flex-col p-2 gap-2">
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-black font-bold text-sm py-2 px-4 hover:bg-green-400 rounded"
                >
                  FEATURES
                </a>
                <a
                  href="#how-it-works"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-black font-bold text-sm py-2 px-4 hover:bg-green-400 rounded"
                >
                  HOW TO START
                </a>
                <a
                  href="#a-wallet"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-black font-bold text-sm py-2 px-4 hover:bg-green-400 rounded"
                >
                  A-WALLET
                </a>
                <a
                  href="#faq"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-black font-bold text-sm py-2 px-4 hover:bg-green-400 rounded"
                >
                  FAQ
                </a>
                <a
                  href="/screener"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-black font-bold text-sm py-2 px-4 hover:bg-green-400 rounded"
                >
                  LAUNCH APP
                </a>
                <a
                  href="https://t.me/a_trade_fun_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-black font-bold text-sm py-2 px-4 hover:bg-green-400 rounded flex items-center gap-2"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.13-.31-1.09-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                  </svg>
                  TELEGRAM
                </a>
                <a
                  href="https://x.com/a_trade_dot_fun"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-black font-bold text-sm py-2 px-4 hover:bg-green-400 rounded flex items-center gap-2"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M4 4h4.6l3.4 4.6L15.6 4H20l-5.4 6.9L20 20h-4.6l-3.6-4.9L8.4 20H4l5.6-7L4 4Z" />
                  </svg>
                  X / Twitter
                </a>
              </div>
            </div>
          )}

          <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Hero Section */}
            <div className="min-h-[calc(100vh-8rem)] sm:min-h-[calc(90vh-4rem)] flex flex-col items-center justify-center text-center relative">
              <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                {suits.map((suit, index) => (
                  <span
                    key={suit.name}
                    className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl animate-pulse text-green-500"
                    style={{ animationDelay: `${index * 0.2}s` }}
                  >
                    {suit.symbol}
                  </span>
                ))}
              </div>
              <div className="text-xs sm:text-sm md:text-base text-green-500/60 mb-4 sm:mb-6">
                &ldquo;Trade like you hold the cards&rdquo;
              </div>

              <div className="relative h-56 w-40 sm:h-72 sm:w-48 md:h-80 md:w-56 lg:h-96 lg:w-64 mx-auto mb-6 sm:mb-8" style={{ perspective: '1200px' }}>
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ animation: `cardSpin 4s linear infinite`, transformStyle: 'preserve-3d' }}
                >
                  <div className="relative w-40 h-56 sm:w-48 sm:h-72 md:w-56 md:h-80 lg:w-64 lg:h-96" style={{ transformStyle: 'preserve-3d' }}>
                    <div
                      className="absolute inset-0 bg-black rounded-lg shadow-2xl shadow-green-500/50 p-3 sm:p-4 md:p-6 flex flex-col justify-between border-2 border-green-500"
                      style={{ backfaceVisibility: 'hidden', transform: 'rotateY(0deg)' }}
                    >
                      <div className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4">
                        <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-green-500 leading-none">A</div>
                        <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl text-green-500 leading-none">{currentSuit.symbol}</div>
                      </div>
                      <div className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl text-green-500 flex items-center justify-center flex-1">{currentSuit.symbol}</div>
                      <div className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 md:bottom-4 md:right-4 transform rotate-180">
                        <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-green-500 leading-none">A</div>
                        <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl text-green-500 leading-none">{currentSuit.symbol}</div>
                      </div>
                      <div className="absolute bottom-8 sm:bottom-10 md:bottom-12 left-1/2 transform -translate-x-1/2 w-full px-1">
                        <div className="text-green-500/70 font-mono text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-center tracking-wider opacity-80">
                          a-trade.fun
                        </div>
                      </div>
                    </div>

                    <div
                      className="absolute inset-0 bg-black rounded-lg shadow-2xl shadow-green-500/50 p-3 sm:p-4 md:p-6 flex flex-col items-center justify-center border-2 border-green-500"
                      style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                    >
                      <div className="text-green-500/80 font-mono text-xs sm:text-sm md:text-base lg:text-lg text-center mb-2">
                        A-TRADE
                      </div>
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        <span className="text-green-500 text-lg sm:text-xl md:text-2xl lg:text-3xl">♠</span>
                        <span className="text-green-500 text-lg sm:text-xl md:text-2xl lg:text-3xl">♥</span>
                        <span className="text-green-500 text-lg sm:text-xl md:text-2xl lg:text-3xl">♣</span>
                        <span className="text-green-500 text-lg sm:text-xl md:text-2xl lg:text-3xl">♦</span>
                      </div>
                      <div className="text-green-500/60 font-mono text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs text-center mt-2">
                        a-trade.fun
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-2 mb-4">
                <a
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 bg-green-500 text-black font-bold text-sm sm:text-base hover:bg-green-400 border-2 border-green-500 text-center"
                >
                  Start Trading
                </a>
                <a
                  href="/screener"
                  className="w-full sm:w-auto px-6 sm:px-8 py-2.5 sm:py-3 bg-transparent text-green-500 font-bold text-sm sm:text-base hover:bg-green-500/10 border-2 border-green-500 text-center"
                >
                  Launch App
                </a>
              </div>

              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 animate-bounce">
                <a href="#features" className="text-green-500/60 hover:text-green-500">
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 sm:w-8 sm:h-8">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </div>
            </div>

            <section id="features" className="mb-8 sm:mb-12">
              <div className="border-t border-green-500/30 pt-6 sm:pt-8 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500 mb-2">[FEATURES]</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {features.map((feature, index) => (
                  <div key={index} className="border border-green-500/30 bg-gray-900/50 p-3 sm:p-4 hover:border-green-500/50 relative">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-green-500 border border-green-500/50 bg-black rounded">
                        {feature.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-green-500 font-bold text-sm sm:text-base">{feature.title}</h3>
                        </div>
                        <p className="text-green-400/70 text-xs sm:text-sm mb-2">{feature.desc}</p>
                        <div className="text-xs text-green-500/60 font-mono bg-black p-1.5 sm:p-2 border border-green-500/20 overflow-x-auto">
                          <code className="whitespace-nowrap">{feature.cmd}</code>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="how-it-works" className="mb-8 sm:mb-12">
              <div className="border-t border-green-500/30 pt-6 sm:pt-8 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500 mb-2">[HOW TO START]</h2>
              </div>
              <div className="space-y-3 sm:space-y-4">
                {steps.map((step, index) => (
                  <div key={index} className="border border-green-500/30 bg-gray-900/50 p-3 sm:p-4 hover:border-green-500/50">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-green-500 flex items-center justify-center text-base sm:text-lg font-bold text-green-500 flex-shrink-0">
                        {step.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-green-500 font-bold mb-1 text-sm sm:text-base">{step.title}</h3>
                        <p className="text-green-400/70 text-xs sm:text-sm mb-2">{step.desc}</p>
                        <div className="text-xs text-green-500/60 font-mono bg-black p-1.5 sm:p-2 border border-green-500/20 inline-block overflow-x-auto">
                          <code className="whitespace-nowrap">{step.cmd}</code>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="a-wallet" className="mb-8 sm:mb-12">
              <div className="border-t border-green-500/30 pt-6 sm:pt-8 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500 mb-2">[DOWNLOAD A-WALLET]</h2>
                <p className="text-green-400/70 text-xs sm:text-sm mt-2">
                  Download our native non-custodial wallet for seamless trading on A-Trade
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {/* macOS Apple Silicon */}
                <div className="border border-green-500/30 bg-gray-900/50 p-4 sm:p-6 hover:border-green-500/50 transition-colors flex flex-col items-center">
                  <a
                    href="/downloads/A-Wallet_0.1.0_aarch64.dmg"
                    download
                    className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-green-500 text-black font-bold text-sm hover:bg-green-400 border-2 border-green-500 text-center transition-colors group"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    <div className="text-left leading-tight">
                      <div className="text-[10px] uppercase font-mono opacity-80">macOS</div>
                      <div>Apple Silicon</div>
                    </div>
                  </a>
                </div>

                {/* macOS Intel */}
                <div className="border border-green-500/30 bg-gray-900/50 p-4 sm:p-6 hover:border-green-500/50 transition-colors flex flex-col items-center">
                  <a
                    href="/downloads/A-Wallet_0.1.0_x64.dmg"
                    download
                    className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-green-500 text-black font-bold text-sm hover:bg-green-400 border-2 border-green-500 text-center transition-colors group"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    <div className="text-left leading-tight">
                      <div className="text-[10px] uppercase font-mono opacity-80">macOS</div>
                      <div>Intel x64</div>
                    </div>
                  </a>
                </div>

                {/* Windows x64 */}
                <div className="border border-green-500/30 bg-gray-900/50 p-4 sm:p-6 hover:border-green-500/50 transition-colors flex flex-col items-center">
                  <a
                    href="/downloads/A-Wallet_0.1.0_x64_en-US.msi"
                    download
                    className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-green-500 text-black font-bold text-sm hover:bg-green-400 border-2 border-green-500 text-center transition-colors group"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0">
                      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                    </svg>
                    <div className="text-left leading-tight">
                      <div className="text-[10px] uppercase font-mono opacity-80">Windows</div>
                      <div>x64 Desktop</div>
                    </div>
                  </a>
                </div>
              </div>

              <div className="mt-4 border border-green-500/20 bg-black p-3 sm:p-4">
                <div className="text-green-500/70 text-xs sm:text-sm">
                  <span className="text-green-500 font-bold">Note:</span> A-Wallet is fully non-custodial, keeping your private keys encrypted and accessible only on your device. Your keys never leave your control.
                </div>
              </div>
            </section>

            <section id="faq" className="mb-8 sm:mb-12">
              <div className="border-t border-green-500/30 pt-6 sm:pt-8 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500 mb-2">[FAQ]</h2>
              </div>
              <div className="space-y-3 sm:space-y-4">
                {faqs.map((faq, index) => (
                  <div key={index} className="border border-green-500/30 bg-gray-900/50 p-3 sm:p-4">
                    <div className="text-green-500 font-bold mb-2 text-sm sm:text-base">{'>'} {faq.q}</div>
                    <div className="text-green-400/70 text-xs sm:text-sm ml-3 sm:ml-4">{faq.a}</div>
                  </div>
                ))}
              </div>
            </section>

            <section id="docs" className="mb-8 sm:mb-12">
              <div className="border-t border-green-500/30 pt-6 sm:pt-8 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-green-500 mb-2">[DOCUMENTATION]</h2>
              </div>
              <div className="border border-green-500/30 bg-gray-900/50 p-4 sm:p-6">
                <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm">
                  <div className="text-green-500 font-mono">{'>'} Quick Start Guide</div>
                  <div className="text-green-400/70 ml-2 sm:ml-4 break-all">$ Detailed guide soon!</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
