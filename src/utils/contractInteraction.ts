import { ethers } from 'ethers';
import { logger } from '@elizaos/core';
import config, { getNetworkConfig } from '../config';

// ABI for the setStrategyReference function
const STRATEGY_VAULT_ABI = [
  "function setStrategyReference(uint256 strategyId, string calldata referenceData) external"
];

/**
 * Connects to a blockchain provider
 * @returns An ethers provider instance
 */
export async function getProvider() {
  // Get network config from the centralized config
  const networkConfig = getNetworkConfig();
  const rpcUrl = networkConfig.rpcUrl;
  
  logger.info(`Connecting to network at ${rpcUrl}`);
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Gets a signer object
 * @returns An ethers signer instance
 */
export async function getSigner() {
  const provider = await getProvider();
  
  // Use a private key from the centralized config
  const privateKey = config.wallet.privateKey;
  if (!privateKey) {
    throw new Error('Wallet private key is not configured');
  }
  
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Sets the strategy reference on the StrategyVault contract
 * @param strategyId The ID of the strategy
 * @param referenceData The IPFS CID or URL pointing to the strategy JSON
 * @returns The transaction receipt
 */
export async function setStrategyReference(strategyId: number, referenceData: string) {
  try {
    const signer = await getSigner();
    const networkConfig = getNetworkConfig();
    
    const strategyVaultAddress = networkConfig.strategyVaultAddress;
    if (!strategyVaultAddress) {
      throw new Error(`Strategy vault address not configured for network: ${config.network}`);
    }
    
    logger.info(`Setting strategy reference for ID ${strategyId} with data: ${referenceData}`);
    logger.info(`Using vault address: ${strategyVaultAddress} on network: ${config.network}`);
    
    const strategyVault = new ethers.Contract(strategyVaultAddress, STRATEGY_VAULT_ABI, signer);
    
    // Send the transaction
    const tx = await strategyVault.setStrategyReference(strategyId, referenceData);
    logger.info(`Transaction sent: ${tx.hash}`);
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    logger.info(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    return receipt;
  } catch (error) {
    logger.error('Error setting strategy reference:', error);
    throw error;
  }
} 