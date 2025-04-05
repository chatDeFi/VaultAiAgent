import { Action, IAgentRuntime, type Memory, type State, type HandlerCallback, logger } from '@elizaos/core';
import { z } from 'zod';

export const StrategySchema = z.object({
  strategy: z.object({
    assetAllocation: z.record(z.string(), z.number()),
    lendingProtocol: z.object({
      investmentCondition: z.string(),
      fallbackCondition: z.string().optional(),
      stopLossCondition: z.string().optional(),
    }),
    rebalancing: z.object({
      frequency: z.string(),
      deviationTolerance: z.string(),
    }),
    transactionLimits: z.object({
      maxTransactionPercentage: z.string(),
      maxSwapSlippage: z.string(),
    }),
  }),
});

export type YieldStrategy = z.infer<typeof StrategySchema>;

/**
 * Action that parses a user's natural language yield strategy into structured JSON.
 */
export const parseStrategyAction: Action = {
  name: 'PARSE_YIELD_STRATEGY',
  similes: ['CREATE_YIELD_STRATEGY', 'DEFINE_YIELD_STRATEGY'],
  description: 'Converts user prompt about a yield strategy into structured JSON for execution',

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Check if the message contains keywords related to yield strategies
    const text = message.content.text.toLowerCase();
    
    // Skip if the message contains "execute" (handled by executeStrategyAction)
    if (text.includes('execute')) {
      logger.info(`PARSE_YIELD_STRATEGY skipping message with "execute": ${text}`);
      return false;
    }
    
    // Skip if message already has the PARSE_YIELD_STRATEGY action - prevents double responses
    if (message.content.actions && message.content.actions.includes('PARSE_YIELD_STRATEGY')) {
      logger.info(`PARSE_YIELD_STRATEGY skipping message with actions already set`);
      return false;
    }
    
    // Skip if message ID has already been processed - additional check to prevent duplicates
    if (message.id && global._processedMessageIds && global._processedMessageIds[message.id]) {
      logger.info(`PARSE_YIELD_STRATEGY skipping already processed message ID: ${message.id}`);
      return false;
    }
    
    const isValid = (
      (text.includes('allocate') || text.includes('invest') || text.includes('strategy')) &&
      (text.includes('yield') || text.includes('apy') || text.includes('earn') || 
       text.includes('lending') || text.includes('stake') || text.includes('rebalance'))
    );
    
    logger.info(`PARSE_YIELD_STRATEGY validation result: ${isValid} for message: "${text}"`);
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
      // Initialize global message tracking if it doesn't exist
      if (!global._processedMessageIds) {
        global._processedMessageIds = {};
      }
      
      // Check if we've already processed this message to avoid duplicate responses
      if (message.content.processed === 'PARSE_YIELD_STRATEGY') {
        logger.info('Message already processed by PARSE_YIELD_STRATEGY, skipping');
        return;
      }
      
      // Additional message ID check to prevent duplicates
      if (message.id && global._processedMessageIds[message.id]) {
        logger.info(`Skipping duplicate processing of message ID: ${message.id}`);
        return;
      }
      
      logger.info(`Processing message ID: ${message.id || 'unknown'}`);
      
      // Mark message as processed both in message and in global registry
      message.content.processed = 'PARSE_YIELD_STRATEGY';
      if (message.id) {
        global._processedMessageIds[message.id] = true;
      }
      
      logger.info('Starting PARSE_YIELD_STRATEGY handler');

      // Use the prompt structure for parsing strategies
      const prompt = `
You are a financial strategy parser assistant. Your task is to parse the user's yield strategy description into a structured JSON format.

# Input
The user's strategy: "${message.content.text}"

# Output Format
Return ONLY a valid JSON object conforming to the following schema:
{
  "strategy": {
    "assetAllocation": {
      // Key-value pairs where key is asset type and value is percentage allocation
      // Example: "stablecoin": 70, "secondaryToken": 30
    },
    "lendingProtocol": {
      "investmentCondition": "String describing when to invest, e.g., 'APY > 6%'",
      "fallbackCondition": "Optional string describing fallback condition",
      "stopLossCondition": "Optional string describing stop loss condition"
    },
    "rebalancing": {
      "frequency": "String describing rebalance frequency, e.g., '24 hours'",
      "deviationTolerance": "String describing deviation tolerance, e.g., '8%'"
    },
    "transactionLimits": {
      "maxTransactionPercentage": "String describing max transaction size, e.g., '12%'",
      "maxSwapSlippage": "String describing max slippage, e.g., '1.8%'"
    }
  }
}

# Examples
Example Input: "I want to allocate 70% of my funds to stablecoins and 30% to a secondary token. Invest in Lending Protocol A only if the APY is above 6%. If the APY falls below 6%, keep funds in the vault, and trigger a stop-loss if it drops below 3.5%. Rebalance the portfolio every 24 hours if the allocation deviates by more than 8%, and limit each transaction to a maximum of 12% of the total vault value with a swap slippage tolerance of 1.8%."

Example Output:
{
  "strategy": {
    "assetAllocation": {
      "stablecoin": 70,
      "secondaryToken": 30
    },
    "lendingProtocol": {
      "investmentCondition": "APY > 6%",
      "fallbackCondition": "APY < 6%",
      "stopLossCondition": "APY < 3.5%"
    },
    "rebalancing": {
      "frequency": "24 hours",
      "deviationTolerance": "8%"
    },
    "transactionLimits": {
      "maxTransactionPercentage": "12%",
      "maxSwapSlippage": "1.8%"
    }
  }
}

Now parse the user's strategy.
`;

      logger.info('Generating strategy JSON using LLM');
      // Generate strategy JSON using the LLM - using the correct ElizaOS method
      const modelResponse = await runtime.useModel('TEXT_LARGE', {
        prompt,
        temperature: 0.2,
        stopSequences: []
      });

      // Extract JSON from the response
      logger.info('Extracting JSON from model response');
      let jsonMatch = modelResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                      modelResponse.match(/\{[\s\S]*\}/);
                      
      if (!jsonMatch) {
        throw new Error('Failed to extract JSON from the response');
      }
      
      const jsonStr = jsonMatch[0].replace(/```json|```/g, '').trim();
      
      // Parse and validate the JSON
      logger.info('Parsing and validating JSON');
      let strategyJSON;
      try {
        strategyJSON = JSON.parse(jsonStr);
        // Validate against our schema
        StrategySchema.parse(strategyJSON);
      } catch (error) {
        logger.error('Error parsing strategy JSON:', error);
        throw new Error(`Failed to parse strategy: ${error.message}`);
      }

      // Create response with the parsed strategy
      logger.info('Creating response with parsed strategy');
      const responseContent = {
        text: `I've parsed your strategy into the following structured format:\n\`\`\`json\n${JSON.stringify(strategyJSON, null, 2)}\n\`\`\`\n\nWould you like to execute this strategy or make any adjustments?`,
        actions: ['PARSE_YIELD_STRATEGY'],
        parsedStrategy: strategyJSON,
        source: message.content.source,
        responseId: `strategy-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      };

      // Store the parsed strategy in the database
      logger.info('Storing strategy in database');
      const memoryId = await runtime.createMemory({
        content: {
          text: JSON.stringify(strategyJSON),
          strategy: strategyJSON,
          responseId: responseContent.responseId
        },
        roomId: message.roomId,
        entityId: runtime.agentId,
        unique: true
      }, 'yieldStrategies');

      logger.info(`Stored yield strategy with ID: ${memoryId}`);

      // Check if we've already sent this exact response
      const alreadySent = (global._sentResponses = global._sentResponses || {});
      const responseHash = JSON.stringify(strategyJSON);
      
      if (alreadySent[responseHash]) {
        logger.info(`Skipping duplicate response with hash: ${responseHash.substring(0, 30)}...`);
        return null;
      }
      
      // Mark this response as sent
      alreadySent[responseHash] = true;

      // Call back with the strategy - only once
      logger.info('Sending parsed strategy to user');
      await callback(responseContent);
      logger.info('PARSE_YIELD_STRATEGY handler completed');
      return responseContent;
    } catch (error) {
      logger.error('Error in PARSE_YIELD_STRATEGY action:', error);
      
      // Return an error message to the user
      const errorContent = {
        text: `I'm having trouble parsing your strategy. Please try to rephrase it with clearer allocation percentages, APY thresholds, and rebalancing rules.`,
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
          text: 'I want to allocate 70% of my funds to stablecoins and 30% to a secondary token. Invest in Lending Protocol A only if the APY is above 6%. If the APY falls below 6%, keep funds in the vault, and trigger a stop-loss if it drops below 3.5%. Rebalance the portfolio every 24 hours if the allocation deviates by more than 8%, and limit each transaction to a maximum of 12% of the total vault value with a swap slippage tolerance of 1.8%.',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: `I've parsed your strategy into the following structured format:
\`\`\`json
{
  "strategy": {
    "assetAllocation": {
      "stablecoin": 70,
      "secondaryToken": 30
    },
    "lendingProtocol": {
      "investmentCondition": "APY > 6%",
      "fallbackCondition": "APY < 6%",
      "stopLossCondition": "APY < 3.5%"
    },
    "rebalancing": {
      "frequency": "24 hours",
      "deviationTolerance": "8%"
    },
    "transactionLimits": {
      "maxTransactionPercentage": "12%",
      "maxSwapSlippage": "1.8%"
    }
  }
}
\`\`\`

Would you like to execute this strategy or make any adjustments?`,
          actions: ['PARSE_YIELD_STRATEGY'],
        },
      },
    ],
  ],
}; 