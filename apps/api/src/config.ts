/**
 * Load config from env. Fails fast on missing required vars.
 */

import "dotenv/config";

const required = (name: string): string => {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
};

export const config = {
  port: Number(process.env.PORT) || 4000,
  rpcUrl: process.env.RPC_URL || "https://fullnode.testnet.sui.io",
  packageId: required("PACKAGE_ID"),
  sponsorPrivateKey: required("SPONSOR_PRIVATE_KEY"),
};

export type Config = typeof config;
