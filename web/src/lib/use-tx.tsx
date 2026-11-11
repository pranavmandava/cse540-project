import { useCallback, useState } from "react";
import { custom, createWalletClient } from "viem";
import { hardhat } from "viem/chains";
import { toast } from "sonner";
import { ABI, CONTRACT_ADDRESS, describeError, publicClient } from "./chain";
import { useApp } from "./app";
import { shortHash } from "./format";

/**
 * Sends a write through the injected wallet, waits for the receipt, then
 * refreshes the shared snapshot so every page reflects the new state.
 */
async function sendViaWallet(functionName: string, args: readonly unknown[]) {
  const provider = typeof window === "undefined" ? undefined : window.ethereum;
  if (!provider) throw new Error("Connect MetaMask before sending a transaction.");

  const walletClient = createWalletClient({ chain: hardhat, transport: custom(provider) });
  const [account] = await walletClient.getAddresses();
  if (!account) throw new Error("No account selected in MetaMask.");

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName,
    args,
    account,
    chain: hardhat,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export function useTx() {
  const { refresh } = useApp();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (label: string, functionName: string, args: readonly unknown[] = []) => {
      setPending(label);
      setError(null);
      try {
        const hash = await sendViaWallet(functionName, args);
        toast.success(label, { description: `Confirmed in ${shortHash(hash)}` });
        refresh();
        return true;
      } catch (cause) {
        const message = describeError(cause);
        setError(message);
        toast.error(label, { description: message });
        return false;
      } finally {
        setPending(null);
      }
    },
    [refresh],
  );

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}
