/** iOS-style status bar for the desktop phone frame (hidden on real phones). */
export function StatusBar() {
  return (
    <div className="status-bar flex shrink-0 items-end justify-between px-7 pb-2">
      <span className="text-[16px] font-semibold tracking-[-0.2px] text-black" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif" }}>
        9:41
      </span>
      <span className="flex items-center gap-[7px] text-black">
        {/* cellular */}
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="10" y="3" width="3" height="9" rx="0.8" />
          <rect x="15" y="0" width="3" height="12" rx="0.8" />
        </svg>
        {/* wifi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-hidden>
          <path d="M8 2.4c2.6 0 5 1 6.8 2.7a.7.7 0 0 0 1-1A11 11 0 0 0 8 1 11 11 0 0 0 .2 4.1a.7.7 0 1 0 1 1A9.6 9.6 0 0 1 8 2.4Z" />
          <path d="M8 5.8c1.7 0 3.2.6 4.4 1.7a.7.7 0 0 0 1-1A7.8 7.8 0 0 0 8 4.4a7.8 7.8 0 0 0-5.4 2.1.7.7 0 1 0 1 1A6.4 6.4 0 0 1 8 5.8Z" />
          <path d="M8 9.2c.8 0 1.5.3 2 .8a.7.7 0 0 0 1-1A4.3 4.3 0 0 0 8 7.8a4.3 4.3 0 0 0-3 1.2.7.7 0 1 0 1 1c.5-.5 1.2-.8 2-.8Z" />
          <circle cx="8" cy="11" r="1" />
        </svg>
        {/* battery */}
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2" y="2" width="20" height="9" rx="2" fill="currentColor" />
          <path d="M25 4.5v4a2 2 0 0 0 0-4Z" fill="currentColor" fillOpacity="0.4" />
        </svg>
      </span>
    </div>
  );
}
