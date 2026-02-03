"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAddress, loginWithGoogle, logout } from "@/lib/auth";
import { getSuiClient } from "@/lib/sui";
import { ADMIN_ADDRESS } from "@/lib/api";

const RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io";

function shortenAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().trim();
}

export default function Header() {
  const pathname = usePathname();
  const [address, setAddress] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = address && normalizeAddress(address) === normalizeAddress(ADMIN_ADDRESS);

  useEffect(() => {
    setAddress(getStoredAddress());
  }, [pathname]);

  const handleSignIn = useCallback(() => {
    const returnTo = typeof window !== "undefined" ? window.location.pathname : "/";
    loginWithGoogle(RPC_URL, returnTo);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setAddress(null);
    setDropdownOpen(false);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="w-24" />

        <Link href="/" className="text-xl font-semibold text-neutral-900">
          OnChainDrips
        </Link>

        <div className="flex w-24 items-center justify-end">
          {!address ? (
            <button
              type="button"
              onClick={handleSignIn}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Sign in
            </button>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                <span className="max-w-[120px] truncate">{shortenAddress(address)}</span>
                <svg
                  className={`h-4 w-4 shrink-0 transition ${dropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-1 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                  <Link
                    href="/dashboard"
                    onClick={() => setDropdownOpen(false)}
                    className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    Dashboard
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin/create"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      Create a drop
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
