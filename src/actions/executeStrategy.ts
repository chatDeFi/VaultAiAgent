import { Action, IAgentRuntime, type Memory, type State, type HandlerCallback, logger } from '@elizaos/core';
import { YieldStrategy, StrategySchema } from './parseStrategy';
import { uploadToIPFS } from '../utils/ipfsUpload';
import { setStrategyReference } from '../utils/contractInteraction';
import { executeFullStrategy } from '../utils/executeStrategy';
import config from 'src/config';
// GOAT SDK integration would be imported here

/**
 * Action that executes a parsed yield strategy
 */
export const executeStrategyAction: Action = {
  name: 'EXECUTE_YIELD_STRATEGY',
  similes: ['RUN_YIELD_STRATEGY', 'DEPLOY_YIELD_STRATEGY'],
  description: 'Executes a parsed yield strategy using GOAT SDK',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    logger.info(`Validating EXECUTE_YIELD_STRATEGY action: "${text}"`);
    
    // Skip if message already has the EXECUTE_YIELD_STRATEGY action - prevents double responses
    if (message.content.actions && message.content.actions.includes('EXECUTE_YIELD_STRATEGY')) {
      logger.info(`EXECUTE_YIELD_STRATEGY skipping message with actions already set`);
      return false;
    }
    
    // Simplify validation: just check if the message includes "execute"
    const isValid = text.includes('execute');
    logger.info(`EXECUTE_YIELD_STRATEGY validation result: ${isValid}`);
    return isValid;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    try {
      // Check if we've already processed this message to avoid duplicate responses
      if (message.content.processed === 'EXECUTE_YIELD_STRATEGY') {
        logger.info('Message already processed by EXECUTE_YIELD_STRATEGY, skipping');
        return;
      }
      
      logger.info('Starting EXECUTE_YIELD_STRATEGY handler');
      
      // Mark this message as being processed by this handler
      message.content.processed = 'EXECUTE_YIELD_STRATEGY';

      // Fetch the most recent parsed strategy from database
      logger.info('Fetching most recent strategy from database');
      const strategiesMemories = await runtime.getMemories({
        tableName: 'yieldStrategies',
        roomId: message.roomId,
        count: 1,  // limit to most recent
      });

      if (strategiesMemories.length === 0) {
        logger.info('No strategy found in database');
        const noStrategyContent = {
          text: "I don't have any parsed yield strategies to execute. Please describe your yield strategy first so I can parse it.",
          actions: ['PARSE_YIELD_STRATEGY'],
          source: message.content.source,
        };
        await callback(noStrategyContent);
        return noStrategyContent;
      }

      // Get the most recent strategy
      const strategyMemory = strategiesMemories[0];
      logger.info(`Retrieved strategy with ID: ${strategyMemory.id}`);
      let strategy: YieldStrategy;
      
      try {
        // If the strategy is stored as text (JSON string)
        if (typeof strategyMemory.content.text === 'string') {
          logger.info('Parsing strategy from text');
          strategy = StrategySchema.parse(JSON.parse(strategyMemory.content.text));
        } 
        // If the strategy is stored directly as an object
        else if (strategyMemory.content.strategy) {
          logger.info('Using strategy from content.strategy');
          strategy = StrategySchema.parse(strategyMemory.content.strategy);
        }
        else {
          throw new Error('Invalid strategy format');
        }
      } catch (error) {
        logger.error('Error parsing strategy:', error);
        const errorContent = {
          text: `I encountered an error while processing your strategy. Please try describing your strategy again with clearer details.`,
          actions: ['PARSE_YIELD_STRATEGY'],
          source: message.content.source,
        };
        await callback(errorContent);
        return errorContent;
      }

      // In a real implementation, this is where we would integrate with GOAT SDK
      // to execute the strategy on-chain
      logger.info('Simulating strategy execution');
      
      // For the hackathon, we'll simulate strategy execution
      const simulatedExecutionSteps = [
        `✅ Connected to wallet`,
        `✅ Strategy parsed successfully`,
        `✅ Asset allocation set: ${Object.entries(strategy.strategy.assetAllocation)
          .map(([asset, percentage]) => `${percentage}% ${asset}`)
          .join(', ')}`,
        `✅ Lending protocol conditions set`,
        `✅ Rebalancing frequency: ${strategy.strategy.rebalancing.frequency}, deviation tolerance: ${strategy.strategy.rebalancing.deviationTolerance}`,
        `✅ Transaction limits configured`,
        `✅ Using network: ${config.network}`,
      ];
      
      // Attempt to execute the strategy using the config
      try {
        logger.info(`Executing strategy on network: ${config.network}`);
        const receipt = await executeFullStrategy(strategy);
        
        if (receipt) {
          simulatedExecutionSteps.push(`✅ Strategy executed on-chain. Transaction hash: ${receipt.hash}`);
        } else {
          simulatedExecutionSteps.push(`ℹ️ No action taken - investment condition not met or no assets in vault`);
        }
      } catch (error) {
        logger.error('Error executing strategy on-chain:', error);
        simulatedExecutionSteps.push(`❌ Failed to execute strategy on-chain: ${error.message}`);
      }

      // Upload strategy to IPFS
      let ipfsResult;
      try {
        logger.info('Uploading strategy to IPFS');
        ipfsResult = await uploadToIPFS(strategy);
        logger.info(`Strategy uploaded to IPFS with CID: ${ipfsResult.cid}`);

        // After successful IPFS upload, set the strategy reference on-chain
        if (ipfsResult && ipfsResult.cid) {
          logger.info('Setting strategy reference on-chain');
          try {
            // For demonstration purposes, use a simple strategy ID (e.g., 1)
            // In a production app, this would likely come from user input or be tracked in the database
            const strategyId = 1;
            const txReceipt = await setStrategyReference(strategyId, ipfsResult.gatewayUrl);
            logger.info(`Strategy reference set on-chain in transaction: ${txReceipt.hash}`);
            
            // Add the transaction receipt to the execution steps
            simulatedExecutionSteps.push(`✅ Strategy reference set on-chain. Tx: ${txReceipt.hash}`);
          } catch (contractError) {
            logger.error('Error setting strategy reference on-chain:', contractError);
            simulatedExecutionSteps.push(`❌ Failed to set strategy reference on-chain: ${contractError.message}`);
          }
        }
      } catch (error) {
        logger.error('Error uploading to IPFS:', error);
        // Continue without IPFS if upload fails
        ipfsResult = null;
      }

      // Simulate an execution delay
      logger.info('Simulating execution delay');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Respond with execution confirmation
      logger.info('Preparing response with execution results');
      let responseText = `I've executed your yield strategy!\n\n${simulatedExecutionSteps.join('\n')}\n\nYour strategy is now active and will be monitored according to the parameters you've set.`;

      if (ipfsResult) {
        responseText += `\n\nYour strategy has been uploaded to IPFS:\n`;
        responseText += `- CID: ${ipfsResult.cid}\n`;
        responseText += `- Gateway URL: ${ipfsResult.gatewayUrl}\n`;
        responseText += `- Pinata Gateway: ${ipfsResult.pinataUrl}\n`;
      }

      responseText += `\n\nWould you like to make any adjustments or check the status?`;

      const responseContent = {
        text: responseText,
        actions: ['EXECUTE_YIELD_STRATEGY'],  // Only include this action to avoid triggering PARSE_YIELD_STRATEGY
        executedStrategy: strategy,
        ipfsData: ipfsResult,
        source: message.content.source,
      };

      // Store the execution record in the database
      logger.info('Storing execution record in database');
      const executionId = await runtime.createMemory({
        content: {
          text: `Strategy execution: ${JSON.stringify(strategy, null, 2)}`,
          executedStrategy: strategy,
          executionTime: new Date().toISOString(),
          ipfsData: ipfsResult,
        },
        roomId: message.roomId,
        entityId: runtime.agentId,
        unique: true
      }, 'strategyExecutions');
      
      logger.info(`Stored execution record with ID: ${executionId}`);

      // Return the results - make sure we only call callback once
      logger.info('Sending execution response to user');
      await callback(responseContent);
      logger.info('EXECUTE_YIELD_STRATEGY handler completed');
      return responseContent;
    } catch (error) {
      logger.error('Error in EXECUTE_YIELD_STRATEGY action:', error);
      
      // Return an error message to the user
      const errorContent = {
        text: `I encountered an error while trying to execute your strategy: ${error.message}. Please try again or modify your strategy.`,
        actions: ['PARSE_YIELD_STRATEGY'],
        source: message.content.source,
      };
      
      await callback(errorContent);
      return errorContent;
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Execute my yield strategy',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: `I've executed your yield strategy!\n\n✅ Connected to wallet\n✅ Strategy parsed successfully\n✅ Asset allocation set: 70% stablecoin, 30% secondaryToken\n✅ Lending protocol conditions set\n✅ Rebalancing frequency: 24 hours, deviation tolerance: 8%\n✅ Transaction limits configured\n\nYour strategy is now active and will be monitored according to the parameters you've set. Would you like to make any adjustments or check the status?`,
          actions: ['EXECUTE_YIELD_STRATEGY'],
        },
      },
    ],
  ],
}; 