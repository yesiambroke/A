'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

export type FavoriteWidgetCoin = {
  id: string;
  name: string;
  symbol: string;
  contractAddress: string;
  mc: string;
  volume24h?: string;
  imageUrl?: string;
  icon?: React.ReactElement | string;
};

type FavoritesWidgetProps = {
  favorites: Set<string>;
  favoriteCoins: FavoriteWidgetCoin[];
  onToggleFavorite: (id: string) => void;
  positionStorageKey?: string;
};

const defaultStorageKey = 'screener_fav_widget_pos';
const openSize = { width: 320, height: 360 };
const closedSize = { width: 140, height: 60 };

const clampPos = (
  pos: { x: number; y: number },
  open: boolean
): { x: number; y: number } => {
  if (typeof window === 'undefined') return pos;
  const margin = 8;
  const size = open ? openSize : closedSize;
  return {
    x: Math.min(Math.max(margin, pos.x), window.innerWidth - size.width - margin),
    y: Math.min(Math.max(margin, pos.y), window.innerHeight - size.height - margin)
  };
};

const getDefaultPos = (open: boolean) => {
  if (typeof window === 'undefined') return null;
  const size = open ? openSize : closedSize;
  const margin = 16;
  return {
    x: window.innerWidth - size.width - margin,
    y: window.innerHeight - size.height - margin
  };
};

const truncateAddress = (address: string) => {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export function FavoritesWidget({
  favorites,
  favoriteCoins,
  onToggleFavorite,
  positionStorageKey = defaultStorageKey
}: FavoritesWidgetProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const dragState = React.useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0
  });
  const ignoreClick = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(positionStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPos(clampPos(parsed, open));
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load widget position', e);
    }
    const fallback = getDefaultPos(false);
    if (fallback) setPos(fallback);
  }, [open, positionStorageKey]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !pos) return;
    localStorage.setItem(positionStorageKey, JSON.stringify(pos));
  }, [pos, positionStorageKey]);

  React.useEffect(() => {
    if (!pos) return;
    const clamped = clampPos(pos, open);
    if (clamped.x !== pos.x || clamped.y !== pos.y) {
      setPos(clamped);
    }
  }, [open, pos]);

  const computeOpenPos = React.useCallback(
    (prev: { x: number; y: number }) => {
      if (typeof window === 'undefined') return prev;
      const centerX = prev.x + closedSize.width / 2;
      const centerY = prev.y + closedSize.height / 2;
      const target = {
        x: centerX - openSize.width / 2,
        y: centerY - openSize.height / 2
      };
      return clampPos(target, true);
    },
    []
  );

  const handleDragStart = (e: React.MouseEvent) => {
    if (!pos) return;
    e.preventDefault();
    dragState.current = {
      dragging: true,
      offsetX: e.clientX - pos.x,
      offsetY: e.clientY - pos.y
    };

    const handleMove = (ev: MouseEvent) => {
      if (!dragState.current.dragging) return;
      ignoreClick.current = true;
      const next = {
        x: ev.clientX - dragState.current.offsetX,
        y: ev.clientY - dragState.current.offsetY
      };
      setPos(clampPos(next, open));
    };

    const handleUp = () => {
      dragState.current.dragging = false;
      setTimeout(() => {
        ignoreClick.current = false;
      }, 0);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  const handleToggle = () => {
    if (ignoreClick.current) return;
    setPos((prev) => {
      const base = prev ?? getDefaultPos(false) ?? { x: 16, y: 16 };
      return open ? clampPos(base, false) : computeOpenPos(base);
    });
    setOpen((v) => !v);
  };

  return (
    <div
      className="fixed z-40"
      style={pos ? { left: pos.x, top: pos.y } : { right: '1rem', bottom: '1rem' }}
    >
      {open ? (
        <div className="w-80 bg-black/90 border border-green-300/50 shadow-lg shadow-green-500/10 rounded">
          <div
            className="flex items-center justify-between px-3 py-2 border-b border-green-300/40 cursor-move select-none"
            onMouseDown={handleDragStart}
          >
            <div className="flex items-center gap-2 text-green-100 font-mono text-sm">
              <span aria-hidden>{'★'}</span>
              <span>Favorites</span>
              <span className="text-green-200/80 text-xs">({favoriteCoins.length})</span>
            </div>
            <button
              className="text-green-100 hover:text-green-50 text-xs font-mono"
              onClick={handleToggle}
            >
              Close
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-green-500/20 scrollbar-thin">
            {favoriteCoins.length === 0 ? (
              <div className="p-4 text-green-200/80 font-mono text-xs">
                No favorites yet. Tap the star on any coin to save it.
              </div>
            ) : (
              favoriteCoins.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-green-100 font-mono text-sm truncate">
                      <span className="truncate">{c.name}</span>
                      <span className="text-green-200/80 text-xs truncate">({c.symbol})</span>
                    </div>
                    <div className="text-green-200/80 font-mono text-[11px] truncate">
                      {truncateAddress(c.contractAddress)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-green-100 font-mono text-xs text-right">
                      <div className="font-bold">{c.mc}</div>
                      {c.volume24h && <div className="text-green-200/80">V {c.volume24h}</div>}
                    </div>
                    <button
                      className="px-2 py-1 text-[11px] font-mono border border-green-300/50 text-green-100 hover:border-green-200 hover:text-green-50"
                      onClick={() => router.push(`/terminal?coin=${c.contractAddress}`)}
                    >
                      Open
                    </button>
                    <button
                      className="text-yellow-400 hover:text-yellow-300"
                      onClick={() => onToggleFavorite(c.contractAddress)}
                      title="Remove from favorites"
                    >
                      {'★'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <button
          className="flex items-center gap-2 px-3 py-2 bg-black/80 border border-green-300/50 rounded shadow-lg shadow-green-500/10 text-green-100 font-mono text-sm hover:border-green-200 cursor-move"
          onClick={handleToggle}
          title="View favorites"
          onMouseDown={handleDragStart}
        >
          <span aria-hidden>{'★'}</span>
          <span>Favs</span>
          <span className="text-green-400 font-bold text-xs">({favorites.size})</span>
        </button>
      )}
    </div>
  );
}
