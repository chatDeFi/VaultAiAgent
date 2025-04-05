import { logger } from '@elizaos/core';

// Define the Pinata response type
interface PinataResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
  isDuplicate?: boolean;
}

/**
 * Uploads a JSON object to IPFS using Pinata
 * @param jsonObject The JSON object to upload
 * @returns Object containing CID and gateway URL
 */
export async function uploadToIPFS(jsonObject: any) {
  try {
    const pinataJwt = process.env.PINATA_JWT;
    const gatewayUrl = process.env.GATEWAY_URL || 'ipfs.io';

    if (!pinataJwt) {
      throw new Error('PINATA_JWT environment variable is not set');
    }

    // Convert JSON object to string
    const jsonString = JSON.stringify(jsonObject);

    // Headers for Pinata API
    const headers = {
      'Authorization': `Bearer ${pinataJwt}`,
      'Content-Type': 'application/json'
    };

    // Direct JSON upload (works in both Node.js and browser)
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        pinataContent: jsonObject,
        pinataMetadata: {
          name: 'yield-strategy.json'
        },
        pinataOptions: {
          cidVersion: 1
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Pinata upload failed: ${JSON.stringify(errorData)}`);
    }

    const result = await response.json() as PinataResponse;
    logger.info('Strategy upload to IPFS successful!');
    logger.info(`IPFS CID: ${result.IpfsHash}`);
    logger.info(`Gateway URL: https://${gatewayUrl}/ipfs/${result.IpfsHash}`);

    return {
      cid: result.IpfsHash,
      gatewayUrl: `https://${gatewayUrl}/ipfs/${result.IpfsHash}`,
      pinataUrl: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`
    };
  } catch (error) {
    logger.error('Error uploading JSON to IPFS:', error);
    throw error;
  }
} 