"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/claims", label: "Claims", exact: false },
  { href: "/drivers", label: "Drivers", exact: false },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <div className="side-block">
      <nav className="side-nav" aria-label="Primary">
        {links.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? "active" : undefined}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <Link href="/claims/new" className="button copper side-action">
        Record a claim
      </Link>
    </div>
  );
}
