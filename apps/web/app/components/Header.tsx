"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredAddress, loginWithGoogle, logout } from "@/lib/auth";
import { ADMIN_ADDRESS } from "@/lib/api";

const RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC_URL ?? "https://fullnode.testnet.sui.io";

function shortenAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().trim();
}

const navTabs = [
  { name: "Drops", href: "/" },
  { name: "Dashboard", href: "/dashboard" },
];

export default function Header() {
  const pathname = usePathname();
  const [address, setAddress] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [shrink, setShrink] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = address && normalizeAddress(address) === normalizeAddress(ADMIN_ADDRESS);

  useEffect(() => {
    setAddress(getStoredAddress());
  }, [pathname]);

  useEffect(() => {
    const handleScroll = () => {
      if (typeof window !== "undefined") {
        if (window.innerWidth >= 768) {
          setShrink(window.scrollY > window.innerHeight * 0.7);
        } else {
          setShrink(false);
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const handleSignIn = useCallback(() => {
    const returnTo = typeof window !== "undefined" ? window.location.pathname : "/";
    loginWithGoogle(RPC_URL, returnTo);
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setAddress(null);
    setDropdownOpen(false);
    setIsMenuOpen(false);
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

  const headerBase = "bg-[rgba(20,10,20,0.55)] backdrop-blur-2xl border-red-600/20";
  const headerShrink = "border-red-600/30";
  const navLinkClass = "text-white/80 hover:text-white";
  const btnClass = "bg-red-600 hover:bg-red-700 text-white shadow-[0_0_16px_0_rgba(220,38,38,0.6)] hover:shadow-[0_0_32px_4px_rgba(220,38,38,0.8)]";
  const menuOpenClass = "bg-black/95 border-red-600/20";
  const menuLinkClass = "text-white hover:text-red-500";

  return (
    <header className="fixed top-0 left-0 w-full z-50 transition-all duration-300 flex justify-center pointer-events-none">
      <div
        className={`
          ${headerBase} backdrop-blur-2xl flex items-center justify-between pointer-events-auto
          ${shrink ? `w-[90vw] max-w-4xl mt-4 rounded-2xl border ${headerShrink} shadow-xl` : "w-full rounded-none border-none mt-0"}
          h-20 px-4 md:px-8 transition-[width,margin,box-shadow,border-radius,border] duration-500 ease-in-out
        `}
      >
        {/* Left: Logo */}
        <div className="flex items-center gap-2 flex-1 md:flex-none">
          <Link href="/" className="flex items-center">
            <Image
              src="/lovable-uploads/logo.png"
              alt="OnChainDrips"
              width={80}
              height={80}
              className="h-16 w-16 md:h-20 md:w-20 transition-all duration-300 object-contain"
            />
          </Link>
        </div>

        {/* Center: Nav tabs (desktop) */}
        <nav className="hidden md:flex items-center gap-6">
          {navTabs.map((tab) => (
            <Link
              key={tab.name}
              href={tab.href}
              className={`${navLinkClass} px-4 py-1 rounded-full transition-colors duration-200 font-medium ${
                pathname === tab.href ? "text-white" : ""
              }`}
            >
              {tab.name}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin/create"
              className={`${navLinkClass} px-4 py-1 rounded-full transition-colors duration-200 font-medium ${
                pathname === "/admin/create" ? "text-white" : ""
              }`}
            >
              Create
            </Link>
          )}
        </nav>

        {/* Right: Sign in / Wallet */}
        <div className="flex items-center flex-1 md:flex-none justify-end">
          {!address ? (
            <button
              type="button"
              onClick={handleSignIn}
              className={`hidden md:inline-flex ${btnClass} px-6 py-2 text-base font-semibold transition-all duration-300 rounded-lg cursor-pointer`}
            >
              Sign in
            </button>
          ) : (
            <div className="relative hidden md:block" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${btnClass} transition-all duration-300`}
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
                <div className="absolute right-0 mt-1 w-48 rounded-lg border border-red-600/30 bg-black/95 backdrop-blur-md py-1 shadow-xl">
                  <Link
                    href="/dashboard"
                    onClick={() => setDropdownOpen(false)}
                    className={`block px-4 py-2 text-sm ${menuLinkClass} hover:bg-red-600/10 rounded-t-lg`}
                  >
                    Dashboard
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin/create"
                      onClick={() => setDropdownOpen(false)}
                      className={`block px-4 py-2 text-sm ${menuLinkClass} hover:bg-red-600/10`}
                    >
                      Create a drop
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={`block w-full px-4 py-2 text-left text-sm ${menuLinkClass} hover:bg-red-600/10 rounded-b-lg`}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden text-white ml-2 p-3"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? (
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div
          className={`md:hidden ${menuOpenClass} backdrop-blur-md border-t fixed inset-0 w-full h-full rounded-none z-[9999] flex flex-col justify-start pt-24 pointer-events-auto`}
        >
          <button
            className="absolute top-4 right-4 z-[10000] p-2 rounded-full bg-black/60 hover:bg-black/80 text-white"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Close menu"
          >
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <nav className="py-6 space-y-4 flex flex-col items-center">
            {navTabs.map((tab) => (
              <Link
                key={tab.name}
                href={tab.href}
                onClick={() => setIsMenuOpen(false)}
                className={`${menuLinkClass} block px-4 py-3 text-lg font-semibold hover:bg-red-600/10 rounded-full transition-colors duration-300 w-full text-center`}
              >
                {tab.name}
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin/create"
                onClick={() => setIsMenuOpen(false)}
                className={`${menuLinkClass} block px-4 py-3 text-lg font-semibold hover:bg-red-600/10 rounded-full transition-colors duration-300 w-full text-center`}
              >
                Create a drop
              </Link>
            )}
            {!address ? (
              <button
                type="button"
                onClick={() => {
                  handleSignIn();
                  setIsMenuOpen(false);
                }}
                className={`${btnClass} px-6 py-2 text-base font-semibold rounded-lg w-full max-w-xs mt-8`}
              >
                Sign in
              </button>
            ) : (
              <div className="w-full max-w-xs mt-8 space-y-2">
                <p className="text-white/70 text-center text-sm truncate px-4">{shortenAddress(address)}</p>
                <Link
                  href="/dashboard"
                  onClick={() => setIsMenuOpen(false)}
                  className={`${menuLinkClass} block px-4 py-3 text-center font-semibold hover:bg-red-600/10 rounded-full`}
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={`${menuTabs} block w-full px-4 py-3 text-center font-semibold hover:bg-red-600/10 rounded-full`}
                >
                  Sign out
                </button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
