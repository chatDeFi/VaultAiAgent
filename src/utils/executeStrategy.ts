import { ethers } from 'ethers';
import { logger } from '@elizaos/core';
import { getProvider, getSigner } from './contractInteraction';
import { YieldStrategy } from '../actions/parseStrategy';
import config, { getNetworkConfig } from 'src/config';

// ABI for the vault execute function
const VAULT_ABI = [
  "function execute(address[] calldata contracts, bytes[] calldata data, uint256[] calldata msgValues) external",
  "function totalAssets() public view returns (uint256)"
];

// ABI for the lending pool and token contracts
const LENDING_POOL_ABI = [
  "function deposit(uint256 amount) external"
];

// ERC20 Token ABI (for approval)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)"
];

// Use the YieldStrategy type from parseStrategy.ts
export type StrategyConfig = YieldStrategy;

/**
 * Gets the total assets in the vault
 * @param vaultAddress The address of the strategy vault
 * @returns The total assets in the vault
 */
export async function getVaultTotalAssets(vaultAddress: string): Promise<bigint> {
  try {
    logger.info(`Getting total assets from vault on network: ${config.network}`);
    
    const provider = await getProvider();
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
    
    const totalAssets = await vault.totalAssets();
    logger.info(`Total assets in vault: ${totalAssets.toString()} wei`);
    
    return totalAssets;
  } catch (error) {
    logger.error('Error getting total assets from vault:', error);
    throw error;
  }
}

/**
 * Executes a strategy by transferring funds from the vault to the lending protocol
 * @param strategy The parsed strategy configuration
 * @param vaultAddress The address of the strategy vault
 * @param lendingPoolAddress The address of the lending pool
 * @param totalAmount The total amount in the vault (in smallest units, e.g., wei)
 * @returns Transaction receipt from the execute function call
 */
export async function executeLendingAllocation(
  strategy: StrategyConfig,
  vaultAddress: string,
  lendingPoolAddress: string,
  totalAmount: ethers.BigNumberish
): Promise<ethers.TransactionReceipt> {
  try {
    logger.info(`Executing lending allocation strategy on network: ${config.network}`);
    
    // Get the signer
    const signer = await getSigner();
    
    // Calculate allocation amounts
    const lendingPercentage = strategy.strategy.assetAllocation.lendingProtocol || 0;
    if (lendingPercentage <= 0) {
      throw new Error('No allocation for lending protocol found in strategy');
    }
    
    // Convert percentage to actual amount
    const amountToDeposit = ethers.toBigInt(totalAmount) * BigInt(lendingPercentage) / 100n;
    logger.info(`Allocating ${lendingPercentage}% (${amountToDeposit.toString()} wei) to lending protocol`);
    
    // Get the network config to find the token address
    const networkConfig = getNetworkConfig();
    const tokenAddress = networkConfig.tokenAddress;
    
    if (!tokenAddress) {
      throw new Error(`Token address not configured for network: ${config.network}`);
    }
    
    // Create contract interfaces
    const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
    const lendingPool = new ethers.Contract(lendingPoolAddress, LENDING_POOL_ABI, signer);
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    
    logger.info('Preparing approval and deposit transactions');
    
    // Step 1: Encode the approve function call
    const approveCalldata = token.interface.encodeFunctionData("approve", [
      lendingPoolAddress, 
      amountToDeposit
    ]);
    
    // Step 2: Encode the deposit function call
    const depositCalldata = lendingPool.interface.encodeFunctionData("deposit", [
      amountToDeposit
    ]);
    
    // Prepare parameters for the execute function (multiple calls in sequence)
    const contracts = [tokenAddress, lendingPoolAddress];
    const data = [approveCalldata, depositCalldata];
    const msgValues = [0, 0]; // No ETH value being sent
    
    logger.info('Executing approval and deposit via vault execute function');
    logger.info(`First approving lending pool (${lendingPoolAddress}) to spend ${amountToDeposit.toString()} tokens`);
    logger.info(`Then depositing ${amountToDeposit.toString()} tokens into lending pool`);
    
    // Call the execute function on the vault to perform both operations
    const tx = await vault.execute(contracts, data, msgValues);
    logger.info(`Transaction sent: ${tx.hash}`);
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    logger.info(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    return receipt;
  } catch (error) {
    logger.error('Error executing lending allocation:', error);
    throw error;
  }
}

/**
 * Validates if the current APY meets the investment condition
 * @param strategy The parsed strategy
 * @param currentAPY The current APY of the lending protocol (in percentage, e.g., 5.7 for 5.7%)
 * @returns Boolean indicating if investment should proceed
 */
export function shouldInvestInLendingProtocol(strategy: StrategyConfig, currentAPY: number): boolean {
  try {
    const condition = strategy.strategy.lendingProtocol.investmentCondition;
    
    // Parse the condition - simple version assuming format like "APY > 6%"
    const match = condition.match(/APY\s*([><=]+)\s*([\d.]+)%?/i);
    if (!match) {
      logger.warn(`Could not parse investment condition: ${condition}`);
      return false;
    }
    
    const operator = match[1];
    const threshold = parseFloat(match[2]);
    
    logger.info(`Evaluating condition: ${currentAPY}% ${operator} ${threshold}%`);
    
    switch (operator) {
      case '>':
        return currentAPY > threshold;
      case '>=':
        return currentAPY >= threshold;
      case '<':
        return currentAPY < threshold;
      case '<=':
        return currentAPY <= threshold;
      case '==':
      case '=':
        return currentAPY === threshold;
      default:
        logger.warn(`Unsupported operator in condition: ${operator}`);
        return false;
    }
  } catch (error) {
    logger.error('Error evaluating investment condition:', error);
    return false;
  }
}

/**
 * Executes the complete strategy based on current conditions
 * @param strategy The parsed strategy
 * @returns Transaction receipt or null if no action was taken
 */
export async function executeFullStrategy(
  strategy: StrategyConfig
): Promise<ethers.TransactionReceipt | null> {
  try {
    // Get network configuration
    const networkConfig = getNetworkConfig();
    const vaultAddress = networkConfig.strategyVaultAddress;
    const lendingPoolAddress = networkConfig.lendingPoolAddress;
    const currentAPY = networkConfig.currentAPY;
    
    // Validate configuration
    if (!vaultAddress) {
      throw new Error(`Strategy vault address not configured for network: ${config.network}`);
    }
    
    if (!lendingPoolAddress) {
      throw new Error(`Lending pool address not configured for network: ${config.network}`);
    }
    
    logger.info(`Executing strategy on network: ${config.network}`);
    logger.info(`Vault address: ${vaultAddress}`);
    logger.info(`Lending pool address: ${lendingPoolAddress}`);
    logger.info(`Current APY: ${currentAPY}%`);
    
    // First check if we should invest based on APY condition
    const shouldInvest = shouldInvestInLendingProtocol(strategy, currentAPY);
    
    if (!shouldInvest) {
      logger.info(`Investment condition not met. Current APY: ${currentAPY}%. Skipping execution.`);
      return null;
    }
    
    // Get the total assets in the vault
    const totalAmount = await getVaultTotalAssets(vaultAddress);
    
    if (totalAmount <= 0n) {
      logger.info('No assets in vault. Skipping execution.');
      return null;
    }
    
    // Execute the allocation
    return await executeLendingAllocation(strategy, vaultAddress, lendingPoolAddress, totalAmount);
  } catch (error) {
    logger.error('Error executing full strategy:', error);
    throw error;
  }
} 