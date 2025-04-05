import { logger } from '@elizaos/core';

// Available blockchain networks
export type Network = 'rootstock' | 'cello' | 'saga';

// Default network to use
const DEFAULT_NETWORK: Network = 'rootstock';

// Get the current network from environment or use default
export const getCurrentNetwork = (): Network => {
  const networkEnv = process.env.CURRENT_NETWORK?.toLowerCase() as Network;
  return networkEnv || DEFAULT_NETWORK;
};

interface NetworkConfig {
  rpcUrl: string;
  strategyVaultAddress: string;
  lendingPoolAddress: string;
  tokenAddress: string;
  currentAPY: number;
}

// Configuration for each supported network
const networks: Record<Network, NetworkConfig> = {
  rootstock: {
    rpcUrl: process.env.ROOTSTOCK_RPC_URL || 'https://public-node.testnet.rsk.co/',
    strategyVaultAddress: process.env.ROOTSTOCK_STRATEGY_VAULT_ADDRESS || '',
    lendingPoolAddress: process.env.ROOTSTOCK_LENDING_POOL_ADDRESS || '',
    tokenAddress: process.env.ROOTSTOCK_TOKEN_ADDRESS || '',
    currentAPY: parseFloat(process.env.ROOTSTOCK_CURRENT_APY || '5.0'),
  },
  cello: {
    rpcUrl: process.env.CELLO_RPC_URL || 'https://alfajores-forno.celo-testnet.org/',
    strategyVaultAddress: process.env.CELLO_STRATEGY_VAULT_ADDRESS || '',
    lendingPoolAddress: process.env.CELLO_LENDING_POOL_ADDRESS || '',
    tokenAddress: process.env.CELLO_TOKEN_ADDRESS || '',
    currentAPY: parseFloat(process.env.CELLO_CURRENT_APY || '5.0'),
  },
  saga: {
    rpcUrl: process.env.SAGA_RPC_URL || 'https://forge-2743785636557000-1.jsonrpc.sagarpc.io/',
    strategyVaultAddress: process.env.SAGA_STRATEGY_VAULT_ADDRESS || '',
    lendingPoolAddress: process.env.SAGA_LENDING_POOL_ADDRESS || '',
    tokenAddress: process.env.SAGA_TOKEN_ADDRESS || '',
    currentAPY: parseFloat(process.env.SAGA_CURRENT_APY || '5.0'),
  },
};

// IPFS configuration
export const ipfsConfig = {
  pinataJwt: process.env.PINATA_JWT || '',
  gatewayUrl: process.env.GATEWAY_URL || '',
  pinataApiKey: process.env.PINATA_API_KEY || '',
  pinataApiSecret: process.env.PINATA_API_SECRET || '',
};

// Wallet configuration
export const walletConfig = {
  privateKey: process.env.AGENT_PRIVATE_KEY || '',
};

// OpenAI configuration
export const aiConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  apiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1',
  smallModel: process.env.SMALL_OPENAI_MODEL || 'gpt-4o-mini',
  mediumModel: process.env.MEDIUM_OPENAI_MODEL || 'gpt-4o',
  largeModel: process.env.LARGE_OPENAI_MODEL || 'gpt-4o',
  embeddingModel: process.env.EMBEDDING_OPENAI_MODEL || 'text-embedding-3-small',
  imageModel: process.env.IMAGE_OPENAI_MODEL || 'dall-e-3',
  useOpenAIEmbedding: process.env.USE_OPENAI_EMBEDDING === 'TRUE',
};

// Get the active network configuration
export const getNetworkConfig = (): NetworkConfig => {
  const network = getCurrentNetwork();
  logger.info(`Using network: ${network}`);
  return networks[network];
};

// Export a single config object for easy access
export default {
  network: getCurrentNetwork(),
  networkConfig: getNetworkConfig(),
  ipfs: ipfsConfig,
  wallet: walletConfig,
  ai: aiConfig,
}; 