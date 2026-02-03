/**
 * Load config from env. Fails fast on missing required vars.
 */

import "dotenv/config";

const required = (name: string): string => {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
};

const optional = (name: string): string | undefined => process.env[name]?.trim();

export const config = {
  port: Number(process.env.PORT) || 4000,
  rpcUrl: process.env.RPC_URL || "https://fullnode.testnet.sui.io",
  packageId: required("PACKAGE_ID"),
  sponsorPrivateKey: required("SPONSOR_PRIVATE_KEY"),
  adminCapObjectId: optional("ADMIN_CAP_OBJECT_ID"),
  adminAddress: optional("ADMIN_ADDRESS"),
  walrusPublisherUrl: process.env.WALRUS_PUBLISHER_URL || "https://publisher.walrus-testnet.walrus.space",
  walrusAggregatorUrl: process.env.WALRUS_AGGREGATOR_URL || "https://aggregator.walrus-testnet.walrus.space",
  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
};

export type Config = typeof config;
