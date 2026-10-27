import type { CSSProperties } from "react";

export type CompanyMarkProps = {
  symbol: string;
  mark?: string;
  color?: string;
  size?: number;
  className?: string;
};

/** Local vector marks keep company identities crisp without third-party image requests. */
export default function CompanyMark({ symbol, mark, color, size = 28, className = "" }: CompanyMarkProps) {
  const normalized = symbol.toUpperCase().replace(/\..*$/, "");
  let artwork;
  switch (normalized) {
    case "AAPL":
      artwork = <path fill="currentColor" d="M20.8 17.2c0-3.3 2.7-4.9 2.8-5-1.5-2.2-3.8-2.5-4.6-2.5-2-.2-3.9 1.2-4.9 1.2-1 0-2.5-1.2-4.1-1.1-2.1 0-4.1 1.3-5.2 3.2-2.2 3.8-.6 9.4 1.6 12.5 1.1 1.5 2.3 3.2 4 3.1 1.6-.1 2.2-1 4.2-1s2.5 1 4.2 1c1.8 0 2.9-1.6 3.9-3.1 1.2-1.8 1.7-3.6 1.8-3.7-.1 0-3.7-1.4-3.7-4.6ZM17.5 7.7c.9-1.1 1.5-2.6 1.3-4.2-1.3.1-2.8.9-3.7 2-.8.9-1.6 2.5-1.4 4 1.4.1 2.9-.7 3.8-1.8Z" />;
      break;
    case "MSFT":
      artwork = <><path fill="#f25022" d="M4 4h11v11H4z" /><path fill="#7fba00" d="M17 4h11v11H17z" /><path fill="#00a4ef" d="M4 17h11v11H4z" /><path fill="#ffb900" d="M17 17h11v11H17z" /></>;
      break;
    case "NVDA":
      artwork = <><path fill="#76b900" d="M3 16c7-10 18-11 27-2v11H17v-4c-6 1-10-1-14-5Zm4 0c3 3 6 4 10 3V9C13 10 10 12 7 16Zm12-7v3c3 0 5 2 7 4-2 3-4 4-7 4v3h9V15c-3-4-6-6-9-6Zm0 5v4c2 0 3-1 4-2-1-1-2-2-4-2Z" /><path fill="#76b900" d="M17 4h13v5H17z" /></>;
      break;
    case "GOOG":
    case "GOOGL":
      artwork = <><path fill="#4285f4" d="M28 16.3c0-.9-.1-1.7-.2-2.5H16v4.7h6.7c-.3 1.6-1.2 2.9-2.5 3.7v3.1h4c2.4-2.2 3.8-5.4 3.8-9Z" /><path fill="#34a853" d="M16 28c3.3 0 6.1-1.1 8.2-2.9l-4-3.1c-1.1.7-2.5 1.1-4.2 1.1-3.2 0-5.9-2.1-6.9-5H5v3.2A12 12 0 0 0 16 28Z" /><path fill="#fbbc05" d="M9.1 18.1a7.2 7.2 0 0 1 0-4.2V10H5a12 12 0 0 0 0 11.3l4.1-3.2Z" /><path fill="#ea4335" d="M16 8.9c1.8 0 3.3.6 4.6 1.8l3.5-3.5A11.7 11.7 0 0 0 16 4 12 12 0 0 0 5 10.7l4.1 3.2c1-2.9 3.7-5 6.9-5Z" /></>;
      break;
    case "AMZN":
      artwork = <><path fill="currentColor" d="M11 9c1-2 3-3 6-3 4 0 6 2 6 6v6c0 1 .5 1.5 1.2 2l-3.4 2.5-2.1-2.4c-1.5 1.6-3 2.3-5.1 2.3-3 0-5-1.9-5-4.7 0-4 4.1-5.6 10.1-5.6v-1c0-1.2-.6-1.9-1.9-1.9-1.2 0-2.1.7-2.4 1.8L11 9Zm7.7 6c-3.6 0-5.6.8-5.6 2.6 0 1 .6 1.5 1.7 1.5 2.1 0 3.9-1.8 3.9-4.1Z" /><path d="M5 25c6 4 14 4 21-.5m-5.3-.8 5.8.3-.9 4" stroke="#ff9900" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>;
      break;
    case "META":
      artwork = <path d="M3 21c0-6 3-13 7-13 5 0 10 16 15 16 3 0 4-2 4-5 0-5-3-11-7-11-5 0-11 16-15 16-3 0-4-1-4-3Z" fill="none" stroke="#087cfa" strokeWidth="3.1" strokeLinecap="round" />;
      break;
    case "TSLA":
      artwork = <><path fill="#e82127" d="M4 6c8-3 16-3 24 0l-1 3c-7-2.5-15-2.5-22 0L4 6Zm2 4c2 2 4 3 6 3l4 16 4-16c2 0 4-1 6-3-7-2-13-2-20 0Z" /></>;
      break;
    case "NFLX":
      artwork = <><path fill="#b20710" d="M8 4h5v24l-5 .5zm11 0h5v24.5l-5-.5z" /><path fill="#e50914" d="M8 4h5l11 24.5-5-.5Z" /></>;
      break;
    case "ADBE":
      artwork = <path fill="#fa0f00" d="M3 4h10L3 28Zm16 0h10v24Zm-3 9 6 15h-5l-2-5h-5Z" />;
      break;
    case "V":
      artwork = <path fill="#1a1f71" d="M4 8h5l3.8 13L18 8h5l-8.5 19H10L6 12C5.6 10.4 4 9 2 9Z" />;
      break;
    case "MA":
      artwork = <><circle cx="11" cy="16" r="9" fill="#eb001b" /><circle cx="21" cy="16" r="9" fill="#f79e1b" fillOpacity=".9" /></>;
      break;
    case "WMT":
      artwork = <g fill="#ffc220">{Array.from({ length: 6 }, (_, index) => <rect key={index} x="14.5" y="2.5" width="3" height="8" rx="1.5" transform={`rotate(${index * 60} 16 16)`} />)}</g>;
      break;
    case "AVGO":
      artwork = <><circle cx="16" cy="16" r="13" fill="#cc092f" /><path d="m6 19 4-9 5 12 5-13 6 10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" /></>;
      break;
    case "ORCL":
      artwork = <rect x="2" y="8" width="28" height="16" rx="8" fill="none" stroke="#f80000" strokeWidth="4" />;
      break;
    case "BABA":
      artwork = <><rect fill="#ff6a00" x="7" y="7" width="18" height="18" rx="4" /><path fill="#fff" d="M10 11h4v10h-4zm8 0h4v10h-4zm-5 4h7v3h-7z" /></>;
      break;
    default:
      artwork = <text x="16" y="17.5" fill={color || "currentColor"} dominantBaseline="middle" textAnchor="middle" fontSize={(mark || normalized).length > 3 ? 10 : 13} fontFamily="Arial, sans-serif" fontWeight="800" letterSpacing="-.7">{mark || normalized.slice(0, 3)}</text>;
  }

  return <svg className={`company-mark company-mark--${normalized.toLowerCase()} ${className}`} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false" style={{ display: "block", flexShrink: 0, color: color || "currentColor" } as CSSProperties}>{artwork}</svg>;
}
