import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toHex, type Address } from "viem";
import {
  CHAIN_ID,
  ROLE_HASH,
  ROLE_NAMES,
  describeError,
  loadSnapshot,
  readContract,
  type RoleName,
  type Snapshot,
} from "./chain";
import { RPC_URL } from "./deployment";

const EIP1193 = (): Window["ethereum"] | undefined =>
  typeof window === "undefined" ? undefined : window.ethereum;

interface AppContextValue {
  snapshot: Snapshot | null;
  loading: boolean;
  loadError: string | null;
  refresh: () => void;

  address: Address | null;
  chainId: number | null;
  roles: RoleName[];
  connecting: boolean;
  connect: () => Promise<void>;
  switchAccount: () => Promise<void>;
  walletError: string | null;

  hasRole: (role: RoleName) => boolean;
  isWrongNetwork: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}

async function ensureChain(provider: NonNullable<Window["ethereum"]>) {
  const current = Number(await provider.request({ method: "eth_chainId" }));
  if (current === CHAIN_ID) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(CHAIN_ID) }],
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: toHex(CHAIN_ID),
          chainName: "Hardhat Local",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [RPC_URL],
        },
      ],
    });
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [roles, setRoles] = useState<RoleName[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  // ---- registry snapshot -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    loadSnapshot()
      .then((next) => {
        if (cancelled) return;
        setSnapshot(next);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(describeError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  // ---- wallet ------------------------------------------------------------
  useEffect(() => {
    const provider = EIP1193();
    if (!provider) return;

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const [first] = accounts as string[];
        if (first) setAddress(first as Address);
      })
      .catch(() => undefined);

    provider
      .request({ method: "eth_chainId" })
      .then((id) => setChainId(Number(id)))
      .catch(() => undefined);

    const onAccounts = (accounts: string[]) => setAddress((accounts[0] as Address) ?? null);
    const onChain = (id: string) => setChainId(Number(id));

    // MetaMask does not always emit accountsChanged after its permission
    // picker closes, so re-sync whenever the tab regains focus.
    const onFocus = () => {
      provider
        .request({ method: "eth_accounts" })
        .then((accounts) => setAddress(((accounts as string[])[0] as Address) ?? null))
        .catch(() => undefined);
    };

    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    window.addEventListener("focus", onFocus);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // ---- roles -------------------------------------------------------------
  useEffect(() => {
    if (!address) {
      setRoles([]);
      return;
    }
    let cancelled = false;

    Promise.all(
      ROLE_NAMES.map(async (role) => {
        const held = await readContract<boolean>("hasRole", [ROLE_HASH[role], address]);
        return held ? role : null;
      }),
    )
      .then((held) => {
        if (!cancelled) setRoles(held.filter((role): role is RoleName => Boolean(role)));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [address, version]);

  /**
   * MetaMask has no RPC to change the active account, but asking for the
   * eth_accounts permission again re-opens its account picker. Whatever the
   * user selects becomes the account this site signs with.
   */
  const switchAccount = useCallback(async () => {
    setWalletError(null);
    const provider = EIP1193();
    if (!provider) {
      setWalletError("No injected wallet found. Install MetaMask and reload.");
      return;
    }

    setConnecting(true);
    try {
      await provider.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const readAccounts = async () => {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        setAddress((accounts[0] as Address) ?? null);
        setChainId(Number(await provider.request({ method: "eth_chainId" })));
      };

      await readAccounts();
      // The picker can settle a beat after it resolves; read once more.
      window.setTimeout(() => void readAccounts(), 700);
      refresh();
    } catch (error) {
      // A cancelled picker is not an error worth showing.
      if ((error as { code?: number }).code !== 4001) {
        setWalletError(describeError(error));
      }
    } finally {
      setConnecting(false);
    }
  }, [refresh]);

  const connect = useCallback(async () => {
    setWalletError(null);
    const provider = EIP1193();
    if (!provider) {
      setWalletError("No injected wallet found. Install MetaMask and reload.");
      return;
    }

    setConnecting(true);
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      await ensureChain(provider);
      setAddress((accounts[0] as Address) ?? null);
      setChainId(Number(await provider.request({ method: "eth_chainId" })));
      refresh();
    } catch (error) {
      setWalletError(describeError(error));
    } finally {
      setConnecting(false);
    }
  }, [refresh]);

  const value = useMemo<AppContextValue>(
    () => ({
      snapshot,
      loading,
      loadError,
      refresh,
      address,
      chainId,
      roles,
      connecting,
      connect,
      switchAccount,
      walletError,
      hasRole: (role: RoleName) => roles.includes(role),
      isWrongNetwork: chainId !== null && chainId !== CHAIN_ID,
    }),
    [
      snapshot,
      loading,
      loadError,
      refresh,
      address,
      chainId,
      roles,
      connecting,
      connect,
      switchAccount,
      walletError,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
