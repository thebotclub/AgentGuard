'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/audit', label: 'Audit Log' },
  { href: '/agents', label: 'Agents' },
  { href: '/policies', label: 'Policies' },
  { href: '/hitl', label: 'HITL Queue' },
  { href: '/report', label: 'Report' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/settings/sso', label: '🔐 SSO' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      style={{
        background: '#0f172a',
        color: '#f1f5f9',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '0',
        height: '56px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      <Link
        href="/"
        aria-label="AgentGuard — Home"
        style={{
          color: '#38bdf8',
          fontWeight: 700,
          fontSize: '16px',
          textDecoration: 'none',
          marginRight: '32px',
          letterSpacing: '-0.02em',
          borderRadius: '4px',
          padding: '4px 2px',
        }}
      >
        🛡️ AgentGuard
      </Link>

      {/* Nav links as a <ul> for proper list semantics */}
      <ul
        role="list"
        style={{
          display: 'flex',
          gap: '4px',
          flex: 1,
          margin: 0,
          padding: 0,
          listStyle: 'none',
        }}
      >
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  color: active ? '#38bdf8' : '#94a3b8',
                  textDecoration: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: active ? 600 : 400,
                  background: active ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  transition: 'color 0.15s, background 0.15s',
                  display: 'block',
                }}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div style={{ fontSize: '12px', color: '#475569' }} aria-label="Version 0.9.0">
        v0.9.0
      </div>
    </nav>
  );
}
