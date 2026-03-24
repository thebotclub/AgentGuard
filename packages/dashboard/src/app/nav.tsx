'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        toggleRef.current &&
        !toggleRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menuOpen]);

  return (
    <>
      <nav
        aria-label="Main navigation"
        className="ag-nav"
      >
        <Link
          href="/"
          aria-label="AgentGuard — Home"
          className="ag-nav-brand"
        >
          🛡️ AgentGuard
        </Link>

        {/* Desktop nav links */}
        <ul
          role="list"
          className="ag-nav-links"
        >
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'ag-nav-link ag-nav-link--active' : 'ag-nav-link'}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ag-nav-version" aria-label="Version 0.9.0">
          v0.9.0
        </div>

        {/* Hamburger button — mobile only */}
        <button
          ref={toggleRef}
          className="ag-nav-toggle"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="ag-mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="ag-nav-toggle-bar" />
          <span className="ag-nav-toggle-bar" />
          <span className="ag-nav-toggle-bar" />
        </button>
      </nav>

      {/* Mobile dropdown menu */}
      <div
        id="ag-mobile-menu"
        ref={menuRef}
        className={menuOpen ? 'ag-mobile-menu ag-mobile-menu--open' : 'ag-mobile-menu'}
        aria-hidden={!menuOpen}
      >
        <ul role="list" className="ag-mobile-links">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'ag-mobile-link ag-mobile-link--active' : 'ag-mobile-link'}
                  tabIndex={menuOpen ? 0 : -1}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
