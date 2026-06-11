Deployment to Somnia Testnet (Foundry)

Prerequisites
- Foundry installed (https://book.getfoundry.sh/getting-started/installation)
- `forge` available in PATH
- An account private key with testnet funds

Environment
Create a file `.env` in `packages/contracts` or export these variables:

- `SOMNIA_RPC` — Somnia RPC URL, e.g. `https://api.infra.testnet.somnia.network/`
- `SOMNIA_RPC_FALLBACK` — optional fallback RPC URL, e.g. `https://dream-rpc.somnia.network`
- `DEPLOYER_PRIVATE_KEY` — Decimal private key value for Foundry `vm.envUint`
- `PRIVATE_KEY` — Optional hex private key alias for other tools; not required by the deploy script
- `SOMNIA_EXPLORER_KEY` — optional, for verification if supported
- `FEE_VAULT` — optional fee recipient; defaults to deployer
- `FEE_BPS` — optional fee basis points; defaults to `10`
- `KEEPER_ADDRESS` — optional keeper address; defaults to deployer. If you want the standard keeper, set it to `0xdE093Bf57d77E49b77010F239A252A7D53dbFd5E`

Build & Test
```bash
# From packages/contracts
forge build
forge test -vv
```

Deploy Script
Use Foundry's `forge script` to deploy `script/Deploy.s.sol`.

```bash
cd packages/contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$SOMNIA_RPC" \
  --chain-id 50312 \
  --broadcast \
  --legacy \
  --gas-limit 8000000 \
  --gas-price 6000000000
```

Or from the repo root using pnpm:

```bash
pnpm --filter @somnia-agent/contracts run deploy:somnia
```

This script prefers `DEPLOYER_PRIVATE_KEY` from environment because it uses `vm.envUint("DEPLOYER_PRIVATE_KEY")`.

If you only have a hex private key, convert it to decimal first:

```bash
export DEPLOYER_PRIVATE_KEY=$(node -e 'console.log(BigInt("0xYOUR_PRIVATE_KEY_HERE").toString())')
```

## Safe deployment workflow
Use a step-by-step deployment rather than deploying implementation, proxy, and initialization in one shot.

1. Deploy the implementation contract only:

```solidity
ExecutionProxy impl = new ExecutionProxy();
```

2. Verify the implementation:

- implementation bytecode exists on-chain
- `owner()` is unset for the implementation contract
- the initializer is disabled for the implementation contract

3. Deploy the proxy separately:

```solidity
new ERC1967Proxy(address(impl), "");
```

4. Verify the proxy through the proxy address:

```solidity
owner()
feeVault()
feeBps()
```

### Environment variable note
The current deploy script forwards only `FEE_VAULT` and `FEE_BPS` into `initialize(address _feeVault, uint256 _feeBps)`.
`KEEPER_ADDRESS` is not consumed by `script/Deploy.s.sol`, and the target contract does not use `initialize(address feeVault, address keeper, ...)`.

Notes
- If `forge` is not installed locally, follow Foundry install steps. On Windows, use WSL or install via the Windows installer script.
- The deploy script may expect constructor args or environment-specific addresses; review `script/Deploy.s.sol` before broadcasting.

If you want, I can try installing Foundry here and run the tests/deploy commands (requires network access and permissions).
