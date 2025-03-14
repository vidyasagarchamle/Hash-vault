"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { STORAGE_PLAN_SIZE, STORAGE_PLAN_PRICE } from '@/lib/constants';
import { storageUpdateEvent, STORAGE_UPDATED } from "./StorageUsage";
import { parseUnits } from "viem";
import { useAccount, useWalletClient, useChainId, useSwitchChain, useReadContract } from "wagmi";
import { useAuth } from "@/lib/hooks/use-auth";
import { base } from "wagmi/chains";

// USDT Contract address on Base network - Verified USDT address
// Base USDT address: https://basescan.org/token/0x4ed4e862860bed51a9570b96d89af5e1b0efefed
const USDT_CONTRACT_ADDRESS = "0x4ed4E862860bED51A9570B96d89aF5E1B0EfEfEd";

// Default decimals for USDT on Base
const DEFAULT_DECIMALS = 6;

// Direct USDT amount to charge (20 USDT)
const USDT_AMOUNT = "20";

// ERC20 ABI with symbol and decimals functions
const ERC20_ABI = [
  {
    "inputs": [
      { "name": "recipient", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

interface StoragePurchaseProps {
  onClose: () => void;
}

export function StoragePurchase({ onClose }: StoragePurchaseProps) {
  const { ready } = useAuth();
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [loading, setLoading] = useState(false);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [tokenDecimalsValue, setTokenDecimalsValue] = useState<number>(DEFAULT_DECIMALS);
  const [displaySymbol, setDisplaySymbol] = useState<string>('USDT');

  // Read token symbol to verify we're using the right token
  const { data: tokenSymbol } = useReadContract({
    address: USDT_CONTRACT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'symbol',
    chainId: base.id,
  });

  // Read token decimals
  const { data: tokenDecimals } = useReadContract({
    address: USDT_CONTRACT_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'decimals',
    chainId: base.id,
  });

  // Check if user is on Base network
  useEffect(() => {
    setIsCorrectNetwork(chainId === base.id);
  }, [chainId]);

  // Update token symbol when available
  useEffect(() => {
    if (tokenSymbol && typeof tokenSymbol === 'string') {
      setDisplaySymbol(tokenSymbol);
      console.log(`Token symbol: ${tokenSymbol}`);
    }
  }, [tokenSymbol]);

  // Update token decimals when available
  useEffect(() => {
    if (tokenDecimals !== undefined) {
      // Ensure tokenDecimals is treated as a number
      const decimalsValue = typeof tokenDecimals === 'number' 
        ? tokenDecimals 
        : typeof tokenDecimals === 'bigint'
          ? Number(tokenDecimals)
          : DEFAULT_DECIMALS;
      
      setTokenDecimalsValue(decimalsValue);
      console.log(`Token decimals: ${decimalsValue}`);
    }
  }, [tokenDecimals]);

  const handleSwitchNetwork = async () => {
    try {
      setLoading(true);
      await switchChain({ chainId: base.id });
      toast.success('Switched to Base network');
    } catch (error) {
      console.error('Failed to switch network:', error);
      toast.error('Failed to switch network. Please try manually.');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!ready || !isConnected || !address || !walletClient) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!isCorrectNetwork) {
      toast.error('Please switch to Base network first');
      return;
    }

    // Verify we're using USDT
    if (displaySymbol !== 'USDT') {
      toast.error(`Wrong token detected: ${displaySymbol}. Expected USDT.`);
      return;
    }

    try {
      setLoading(true);
      
      console.log(`Using token decimals: ${tokenDecimalsValue}`);
      
      // Use direct USDT amount (20 USDT)
      const usdtAmount = parseUnits(USDT_AMOUNT, tokenDecimalsValue);
      
      console.log(`Sending ${USDT_AMOUNT} ${displaySymbol} on Base network with ${tokenDecimalsValue} decimals`);
      
      // Send USDT transaction using the ERC20 transfer function
      const txHash = await walletClient.writeContract({
        address: USDT_CONTRACT_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [
          process.env.NEXT_PUBLIC_PAYMENT_ADDRESS as `0x${string}`,
          usdtAmount
        ]
      });
      
      toast.info(`Transaction submitted, waiting for confirmation...`);
      
      // Call the storage purchase API
      const purchaseResponse = await fetch('/api/storage/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': address
        },
        body: JSON.stringify({
          transactionHash: txHash,
          paymentMethod: displaySymbol,
          network: 'Base'
        })
      });

      if (!purchaseResponse.ok) {
        throw new Error('Failed to process storage purchase');
      }

      toast.success('Successfully purchased additional storage!');
      
      // Trigger storage update
      storageUpdateEvent.dispatchEvent(new Event(STORAGE_UPDATED));
      
      // Close the modal
      onClose();
    } catch (error) {
      console.error('Storage purchase error:', error);
      toast.error('Failed to purchase storage. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatStorage = (bytes: number) => {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)}GB`;
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Purchase Additional Storage</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
        </div>
        
        <p className="text-sm text-gray-500">
          Extend your storage capacity with our premium plan
        </p>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="font-medium">{formatStorage(STORAGE_PLAN_SIZE)} Storage Plan</h4>
              <p className="text-sm text-gray-500">Additional storage space</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{USDT_AMOUNT} USDT</p>
              <p className="text-xs text-gray-500">One-time payment</p>
            </div>
          </div>

          {!isCorrectNetwork && isConnected ? (
            <div className="mb-4">
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-md mb-3 text-sm">
                Please switch to Base network to continue with the purchase.
              </div>
              <Button 
                className="w-full" 
                onClick={handleSwitchNetwork}
                disabled={loading}
              >
                {loading ? 'Switching...' : 'Switch to Base Network'}
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handlePurchase}
              disabled={loading || !ready || !isConnected || !address || !walletClient || !isCorrectNetwork}
            >
              {loading ? 'Processing...' : `Purchase Now with ${USDT_AMOUNT} USDT`}
            </Button>
          )}
        </div>

        <div className="text-xs text-gray-500">
          <p>• Storage space is added to your account immediately after purchase</p>
          <p>• One-time payment, no recurring fees</p>
          <p>• Purchase multiple plans if you need more space</p>
          <p>• Payment will be processed in {USDT_AMOUNT} USDT on the Base network</p>
          <p className="font-medium text-blue-600 dark:text-blue-400">• You must be connected to Base network to make a payment</p>
        </div>
      </div>
    </Card>
  );
} 