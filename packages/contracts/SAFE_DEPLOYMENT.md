# Safe Deployment Guide for `ExecutionProxy`

This guide documents a safer deployment workflow for `ExecutionProxy` on Somnia.
Follow each step and verify before moving to the next.

## Step A: Deploy implementation only

Deploy the implementation contract directly without initializing it.

```solidity
ExecutionProxy impl = new ExecutionProxy();
```

### Why
- prevents accidental initialization of the implementation
- makes the implementation immutable to proxy delegatecall state
- allows you to verify the implementation before using it

## Step B: Verify implementation

Verify these properties on the implementation address:

- bytecode exists on-chain
- `owner()` is not set or is the zero address for implementation
- initializer is disabled for the implementation contract

This protects against the implementation being initialized directly later.

## Step C: Deploy the proxy separately

Deploy the upgradeable proxy using the implementation address.

```solidity
new ERC1967Proxy(address(impl), "");
```

### Why
- separates implementation deploy from proxy deploy
- keeps initialization logic scoped to the proxy
- avoids delegatecall initialization edge cases during construction

## Step D: Verify the proxy through the proxy address

Once the proxy is deployed, verify the proxied state:

```solidity
owner();
feeVault();
feeBps();
```

If those values are correct, the proxy is initialized and ready.

## Environment variable check

The current deploy script sends only these values into `initialize(...)`:

- `FEE_VAULT`
- `FEE_BPS`

The `ExecutionProxy` initializer signature is:

```solidity
initialize(address _feeVault, uint256 _feeBps)
```

So `KEEPER_ADDRESS` is not used by `script/Deploy.s.sol`.

## Recommended command

From `packages/contracts`, run:

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$SOMNIA_RPC" \
  --chain-id 50312 \
  --broadcast \
  --legacy \
  --gas-limit 8000000 \
  --gas-price 6000000000
```

Or from repo root:

```bash
pnpm --filter @somnia-agent/contracts run deploy:somnia
```

## Final note

Do not deploy the implementation and proxy in a single atomic operation unless you are comfortable with the proxy initialization flow. Use these verification steps to reduce risk.
