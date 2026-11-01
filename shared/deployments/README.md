# Deployment records

`scripts/deploy.ts` writes one JSON file per chain here:

```
shared/deployments/<chainId>.json
```

Each file contains the contract name, chain id, address, deploy timestamp, deployer, role assignments, and the compiled ABI. The web client imports this file so the address and ABI are never hand-copied.

The JSON files are **gitignored on purpose**: they are build output, and an address recorded on one machine is meaningless on another. Run the deploy script to regenerate yours.

| Chain id | Network | Status |
| --- | --- | --- |
| `31337` | Hardhat local node | regenerated on every `bunx hardhat node` + deploy |
| `84532` | Base Sepolia | added in P4 |
