# Robinhood Chain BIO Bridge — Design & Requirements (Spike Scoping)

**Date:** 2026-09-06
**Status:** Draft — scoping input for the implementation spike
**Scope:** this repo (`src/wormhole.config.ts`, `src/App.tsx`, deployment), the BIO NTT deployment
(`bio-xyz/Wormhole-NTT-Deployments/BIO/deployment.json` + contracts on Ethereum/Solana/Base/BSC +
a new Robinhood spoke), and follow-up touchpoints in `bio-xyz/genome`
(`packages/utils/src/bio-ecosystem-urls.ts`, `packages/base-chain`, `packages/org-wallets`, `apps/www`).

Every fact below carries a source. Facts we could not verify from a primary source are marked
**UNVERIFIED** and appear again in §11 *Open questions*.

---

## 1. Problem

Bio users can bridge BIO between Ethereum, Solana, Base and BSC through this Wormhole Connect
widget, backed by a Wormhole **Native Token Transfers (NTT)** deployment. Robinhood Chain (an
Arbitrum Orbit L2 operated by Robinhood, public mainnet since 2026-07-01) is a new distribution
surface. The first spike must let a user move BIO between Robinhood Chain and at least one existing
BIO chain, using the same NTT deployment, without introducing a second bridge stack or a second
BIO asset.

## 2. Current state (verified)

### 2.1 Bridge UI (`bio-xyz/wormhole-bridge-ui`)

- Static Next.js 15 export (`output: "export"`) that mounts one component:
  `<WormholeConnect config={wormholeConfig} theme={...} />` (`src/App.tsx`).
- `@wormhole-foundation/wormhole-connect` **5.1.1**, routed through `nttExecutorRoute` from
  `@wormhole-foundation/wormhole-connect/ntt` (migrated from Standard Relay in PR #10, 2026-04-16).
- The whole config surface is `src/wormhole.config.ts`: `chains`, `rpcs` (env-driven),
  `tokens`, `tokensConfig`, and one `nttExecutorRoute({ ntt: { tokens } })` block for BIO, GROW,
  QBIO, NEURON, AUBRAI. Chains today: `Ethereum`, `Solana`, `Base`, `Bsc`.
- Connect 5.1.1 and 6.0.0 (newest release, 2026-05-15) both pin `@wormhole-foundation/sdk-*`
  **4.9.1** and `sdk-route-ntt` **4.0.14** exactly (npm `dependencies`; `pnpm-lock.yaml` here
  confirms 4.9.1).

### 2.2 BIO NTT deployment (`bio-xyz/Wormhole-NTT-Deployments`, commit `d6171ab`)

`BIO/deployment.json` is the source of truth. It is a vendored snapshot of the NTT repo with EVM
contracts at `NTT_MANAGER_VERSION = "1.1.0"` / `WORMHOLE_TRANSCEIVER_VERSION = "1.1.0"`.

| Chain | Version | Mode | Manager | Token | Outbound limit | Inbound limits |
|---|---|---|---|---|---|---|
| Ethereum | 1.1.0 | **burning** | `0x1783E7d1F498321D7E15044d769621E1beDc7F4C` | `0xcb1592591996765Ec0eFc1f92599A19767ee5ffA` (18) | 66 400 000 | Solana, Base: 66 400 000 |
| Solana | 2.0.0 | burning | `ntt11hdA4n1PupHhLyT1fsjg4YF9agVz3CTuzLRQs1H` | `bioJ9JTqW62MLz7UKHU69gtKhPpGi1BQhccj2kmSvUJ` (9) | 66 400 000 | Ethereum, Base: 66 400 000 |
| Base | 1.1.0 | burning | `0x9AfEbcA0d37661167AFD24481C39eBE2Ead89571` | `0x226A2FA2556C48245E57cd1cbA4C6c9e67077DD2` (18) | 184 467 440 737 (uint64 max, effectively unlimited) | Ethereum, Solana: 66 400 000 |

- Owner **and** pauser on Ethereum and Base: `0x9eC0B6aE27214d45cA4A26e52E0Efb9f8a9099b5`;
  Solana owner `man5NNs4NvVgczbEpxFxjGXCSwCEx8rrN4eRkR26CcJ`. Threshold 1 everywhere. Whether
  `0x9eC0…` is an EOA or a Safe is **UNVERIFIED** (explorer access blocked here).
- **BIO is pure burn-and-mint** on every chain; there is no locking hub (contrast: GROW is
  `locking` on Ethereum, QBIO is `burning`). The NttManager must therefore be a minter of the BIO
  token on Ethereum as well.
- **BSC is absent** from `deployment.json`, yet the widget config carries a BSC manager
  `0x6915fE8Dad5d32C2EE961e2F432d7DD5916316de` and transceiver `0x86206f…`. The deployment repo is
  behind the live deployment; the Base and BSC token share address `0x226A…7DD2`, which implies a
  deterministic deploy. Reconciling this is the first step (R-C1).
- The v1.1.0 `WormholeTransceiver` constructor takes `wormholeRelayerAddr` and
  `specialRelayerAddr` (Standard Relayer). NTT v2.0.0+evm removed the Standard Relayer and added
  Custom Consistency Level (CCL). This matters for Robinhood (§6).

### 2.3 `bio-xyz/genome` monorepo

There is **no bridge, Wormhole, or NTT code** in genome (repo-wide search: zero hits for
wormhole/NTT/transceiver/robinhood/arbitrum). Touchpoints a new chain will eventually hit:

- `packages/utils/src/bio-ecosystem-urls.ts` — `BIO_ECOSYSTEM_URLS.bridge` points at
  **portalbridge.com** (Ethereum→Solana deep link), not at this repo's deployment. The same URL is
  duplicated verbatim in `packages/buildspace-ui/src/components/buildspace/text.json`,
  `apps/buildspace/lib/text.json`, and `apps/openlabs/lib/texts.ts`.
- `packages/base-chain/src/tokens.ts` — the only typed BIO token registry (Base only; Ethereum and
  Solana BIO addresses exist only inside the portalbridge query string).
- `packages/openlabs-contracts/src/networks.ts` — house pattern for a chain missing from
  `viem/chains` (`defineChain` + `SUPPORTED_CHAINS` + `resolveChain`).
- `packages/org-wallets/src/hooks/use-linked-wallet-client.ts` — `wallet_switchEthereumChain` with
  `wallet_addEthereumChain` fallback built from a viem `Chain`; a Robinhood `defineChain` makes
  add-network prompts work.
- `apps/www/src/components/AboutNetworkCard.tsx` (`ABOUT_NETWORK_ITEMS`) feeds both the About grid
  and `llms.txt`; the bridge is not listed as a product today.
- Design-spec convention: `docs/superpowers/specs/<date>-<topic>-design.md` (this document follows
  it); work is tracked in Linear per `.cursor/rules/linear.mdc`.

## 3. Robinhood Chain — fact sheet

| Item | Value | Source |
|---|---|---|
| Stack | Arbitrum Nitro / Orbit, ArbOS 61, Rollup mode posting blobs to Ethereum L1 (not AnyTrust, not an L3) | docs.robinhood.com/chain/, …/run-a-full-node/, l2beat `projects/robinhood/robinhood.ts` |
| Settlement / parent | Ethereum L1 (chain 1), `confirmPeriodBlocks` 45818 (~7-day exit) | OffchainLabs/arbitrum-portal `orbitChainsData.json`, docs.robinhood.com/chain/bridging/ |
| Mainnet chain ID | **4663**, "Robinhood Chain", gas token ETH | ethereum-lists/chains `eip155-4663.json` |
| Testnet chain ID | **46630** (Sepolia parent). Third-party pages quoting 46646 are wrong | `eip155-46630.json`, arbitrum-portal `ChainId.ts`, docs.robinhood.com/chain/deploy-smart-contracts/ |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` (rate-limited; Alchemy `robinhood-mainnet.g.alchemy.com` recommended). Testnet `https://rpc.testnet.chain.robinhood.com/rpc` | docs.robinhood.com/chain/connecting/ |
| WSS | Community: `wss://robinhood-rpc.publicnode.com`. Official JSON-RPC WSS **UNVERIFIED** | ethereum-lists |
| Explorer | `https://robinhoodchain.blockscout.com` (Blockscout; `forge verify-contract --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/`) | docs.robinhood.com/chain/deploy-smart-contracts/ |
| Block time | ~100 ms; FCFS sequencer ordering, no priority auction | robinhood.com/us/en/chain/, docs.robinhood.com/chain/gas-and-fees/ |
| `block.number` | Returns an L1 block estimate (Arbitrum semantics); L2 height via `ArbSys(100).arbBlockNumber()`. Guardians use RPC block tags, so NTT is unaffected | docs.robinhood.com/chain/differences-from-ethereum/, arbitrum-docs block-numbers-and-time |
| Status | Public testnet 2026-02-10; public mainnet 2026-07-01 (whitelist removed). Contract deployment permissionless | Robinhood newsroom; l2beat config |
| Trust caveats | Robinhood runs the sequencer; ArbOS 61 transaction filterer can nullify force-included txs; permissioned validator set (L2BEAT classifies as "Other"). 14-minute block halt on 2026-09-04 | l2beat config; cryptobriefing.com |
| Robinhood app | Brokerage transfers on Robinhood Chain support ETH, USDG, CASHCAT only. Arbitrary ERC-20s reach users via Robinhood Wallet (self-custody) or any EVM wallet | robinhood.com support articles |
| Other bridges live | Arbitrum canonical bridge, Chainlink CCIP (day one), LayerZero V2, Hyperlane (Mailbox `0x3a86…aa7`), Across. No CCTP evidence | prnewswire, hyperlane-registry, across.to |

## 4. Wormhole support matrix for Robinhood Chain

Checked directly in `@wormhole-foundation/sdk-base@6.1.5` (`dist/esm/constants/*`),
`@wormhole-foundation/sdk-route-ntt@8.0.1`, `@wormhole-foundation/sdk-evm-ntt@8.0.1`, the
`wormhole-connect` `development` branch, `native-token-transfers` `main`, and `wormhole` `main`.

| Component | Robinhood status | Evidence |
|---|---|---|
| Wormhole chain ID | **72**, name `Robinhood`, platform `Evm`, **Mainnet only** | `chains.js` `[72, "Robinhood"]`; `nativeChainIds.js` `["Robinhood", 4663n]` in the Mainnet block only; `wormhole/sdk/vaa/structs.go` `ChainIDRobinhoodChain = 72` |
| Core Bridge | ✅ `0x141fBa8AD5D61bdaB45A047cF60b5Ad9784987FB` | `contracts/core.js`; `wormhole/ethereum/env/.env.robinhoodchain.mainnet` (`INIT_CHAIN_ID=72`, `INIT_EVM_CHAIN_ID=4663`) |
| Guardian observation | ✅ watcher `{Finalized: true, Safe: true, EvmChainID: 4663}` since guardian v2.67.0 (2026-08-04); delegated guardian set "dgs 10 (robinhood, fogo)" in v2.68.0 (2026-09-04) | `node/pkg/watchers/evm/chain_config.go`; wormhole PRs #4920, #4948 |
| Executor contract | ✅ `0xd19aAd5a69F7D35Cee169D9D90e1BbCB795ABB38` | `contracts/executor.js` |
| Executor API capabilities for chain 72 (`GET https://executor.labsapis.com/v0/capabilities`; destination must advertise request prefix `ERN1`) | **UNVERIFIED** — host blocked from this environment | `sdk-route-ntt/executor/executor.js` gating logic |
| `NttManagerWithExecutor` helper (needed on the **source** chain for Executor-route sends) | ❌ no Robinhood entry (present for Ethereum `0xC079…`, Base `0x27db…`, Bsc `0x83f5…`, Arc, Hydration, MegaETH, …). Route throws `Executor address not found for chain Robinhood` | `sdk-evm-ntt/dist/esm/nttWithExecutor.js` `nttManagerWithExecutorAddresses.Mainnet` |
| Standard Relayer | ❌ not deployed | `contracts/relayer.js` |
| Token Bridge / Portal | ❌ not deployed | `contracts/tokenBridge.js`, `executorTokenBridge.js` |
| Custom Consistency Level (CCL) contract | ❌ not deployed | `contracts/customConsistencyLevel.js` |
| Testnet entry | ❌ none | `nativeChainIds.js`, `rpc.js`, `core.js`; docs data `ntt.testnet: false` |
| Governor chain list | not listed | `node/pkg/governor/mainnet_chains.go` |
| SDK finality constants | 4096 blocks, 100 ms block time ("matches other sub-second L2s") | `finality.js` |
| Default RPC / explorer in SDK | `https://rpc.mainnet.chain.robinhood.com`, `https://robinhoodchain.blockscout.com/` | `rpc.js`, `explorer.js` |
| **First SDK version with Robinhood** | `sdk-base` **6.1.5** (2026-07-29, PR wormhole-sdk-ts#1031). 6.1.4 and earlier: none | bisected 5.2.0 → 6.1.5 via npm installs |
| Wormhole Connect (all releases incl. 6.0.0, and `development`) | ❌ pins SDK **4.9.1**; static `src/config/mainnet/chains.ts` has 34 chains, no Robinhood; `chains` config only *filters* that list and drops unknown names silently; `WormholeConnectConfig` has no custom-chain definition | Connect `package.json`, `src/config/index.ts`, `src/config/mainnet/chains.ts`, `src/config/types.ts` |
| NTT CLI (`main`, v1.7.0) | ⚠️ `overrides` pin SDK **6.1.4**, one patch before Robinhood; `chainToPlatform("Robinhood")` would throw until bumped | `native-token-transfers/cli/package.json` |
| `sdk-route-ntt` / `sdk-evm-ntt` 8.0.1 | ⚠️ peer-depend on `sdk-connect`/`sdk-base` **6.1.4** | package.json `peerDependencies` |
| NTT EVM contract version needed on Robinhood | v1.1.0 transceiver requires Standard Relayer + Special Relayer addresses (none on Robinhood). v2.0.0+evm removed the Standard Relayer ("SR removal and CCL", NTT PR #772) | vendored `BIO/evm/src/Transceiver/WormholeTransceiver/WormholeTransceiver.sol`; NTT release `v2.0.0+evm` |
| Wormhole docs product data | NTT mainnet ✅, testnet ❌, MultiGov ✅, Queries ✅; no `connect`/`tokenBridge`/`cctp` keys | `wormhole-docs/scripts/src/chains/Robinhood.json` |
| Existing NTT on Robinhood | at least one live deployment ($PONS, Robinhood Chain ↔ Solana) | wormhole X post 2094486628769177658 (snippet only) |
| Orbit precedent | Plume (Wormhole 55, Orbit-based) has Core, Executor, NttManagerWithExecutor and NTT | sdk-base constants |

**Consequence.** The chain is fully onboarded at the protocol layer (Core + Guardians + Executor +
NTT), but none of the tooling we use today (Connect widget, NTT CLI release, Executor helper table,
our v1.1.0 contract snapshot) knows about it yet. The spike is therefore gated on upstream package
movement or on the workarounds in §6.

## 5. Goals / Non-goals

### Goals

1. A user holding BIO on Ethereum (and, once peers are registered, Base/BSC/Solana) can send it to
   Robinhood Chain and receive canonical NTT-minted BIO there; and back.
2. Robinhood Chain BIO is part of the **same NTT deployment** (same `deployment.json`, same
   burn-and-mint supply accounting), not a wrapped or separately-issued asset.
3. Transfers are relayed automatically (Executor route) wherever the Executor supports the pair;
   a manual-redeem fallback is acceptable for the spike where it does not.
4. The bridge UI exposes Robinhood Chain for BIO only. GROW, QBIO, NEURON, AUBRAI are untouched.
5. Ops can pause, rate-limit and monitor the new spoke like the existing ones.

### Non-goals

- Portal Bridge / Token Bridge wrapped BIO on Robinhood (Token Bridge is not deployed there).
- Robinhood *testnet* bridging (Wormhole has no testnet entry for Robinhood; see R-T1).
- Bridging the other four NTT tokens to Robinhood.
- Listing BIO inside the Robinhood brokerage app (only ETH, USDG, CASHCAT are transferable there;
  that is Robinhood's decision).
- Replacing Connect for the existing four chains.
- Upgrading the existing v1.1.0 managers on Ethereum/Base/BSC.

## 6. Key decisions

| Decision | Choice | Rationale / alternatives rejected |
|---|---|---|
| Bridging mechanism | **NTT spoke on Robinhood, `burning` mode**, wired into the existing deployment | Only NTT is live on Robinhood (no Token Bridge). Every existing BIO chain is `burning`; the CLI enforces at most one `locking` chain anyway. |
| Token contract on Robinhood | NTT-compatible ERC-20 (`mint`/`burn`, manager as sole minter, 18 decimals); reuse the verified source of the Base/BSC BIO token, else `PeerToken` from `wormhole-foundation/example-ntt-token-evm`. Same address `0x226A…7DD2` via deterministic deploy is a **nice-to-have** | Address parity simplifies docs and token lists but needs the original deployer key/nonce or CREATE2 salt (Q-C2). |
| NTT contract version on Robinhood | **v2.0.0+evm** (`ntt add-chain --latest`) because v1.1.0's transceiver requires Standard Relayer addresses that do not exist on Robinhood. **Precondition:** written confirmation from Wormhole that a v2 EVM manager peers with v1.1.0 EVM managers, or pin `--ver` to whatever Wormhole recommends | Solana 2.0.0 already peers with EVM 1.1.0, so the wire format spans versions, but EVM v2 ↔ EVM v1.1.0 is **UNVERIFIED** (Q-C5). Upgrading Ethereum/Base/BSC to v2 is out of scope for a spike. |
| Consistency level | `finalized` via the standard transceiver, **no CCL** | No CCL contract on Robinhood; Guardians themselves wait for `finalized`. Faster settings buy nothing and add re-org risk. |
| Relay | Executor route for Ethereum/Base/BSC/Solana → Robinhood; Robinhood → X via Executor **only once** Wormhole Labs deploys `NttManagerWithExecutor` on Robinhood and publishes it in `sdk-evm-ntt`; until then the manual route | Executor is the direction this repo already migrated to (PR #10). The helper is a Wormhole Labs deployment, not something to fork around in a spike. |
| Peer registration | Register Robinhood as peer on **all** existing managers in the spike (required for a consistent `deployment.json` and future `ntt push`), even if the UI first exposes only Ethereum ↔ Robinhood | Partial peering leaves the deployment inconsistent. Requires each manager's owner signer (Q-C3). |
| Signing model | `ntt push` signs with `ETH_PRIVATE_KEY` and requires it to be the manager owner (or an `INttOwner` contract); there is no calldata-export path. If `0x9eC0…` is a Safe, the ceremony is manual `setPeer` / `setWormholePeer` / `setIsWormholeEvmChain` / `setInboundLimit` calls through the Safe | Decides whether the spike is a CLI run or a multisig ceremony (Q-C3, Q-C4). |
| UI delivery for the spike | **Primary:** track/contribute the upstream Connect change (Robinhood entry in `MAINNET_CHAINS` + icon + SDK bump ≥ 6.1.5 + `sdk-route-ntt` ≥ 8.x) and upgrade this repo when released. **Fallback if upstream slips:** a thin SDK-driven route page in this app for Robinhood pairs only, on `@wormhole-foundation/sdk@≥6.1.5` + `sdk-route-ntt@≥8.0.1`, mounted beside the Connect widget | No config in `wormhole.config.ts` can surface Robinhood: Connect's chain list is static and its SDK is 4.9.1. Forking Connect means owning a 4.9.1→6.x SDK migration of a large widget. Portal Bridge is the same Connect build and has the same gap. |
| Chain scope of the UI in the spike | Ethereum ↔ Robinhood first; Base/BSC ↔ Robinhood next; Solana ↔ Robinhood last | Ethereum holds most BIO; EVM↔EVM avoids Solana wallet handling in a custom page. |
| Rate limits at launch | Conservative outbound limit on Robinhood and matching Robinhood inbound limits on Ethereum/Solana/Base/BSC; raise after observation. Do **not** copy Base's uint64-max outbound | No testnet exists, so mainnet *is* the test environment; limits bound the blast radius. |
| Where genome changes land | Follow-up, not in the spike: repoint `BIO_ECOSYSTEM_URLS.bridge` and the three duplicated footer links to this deployment; add Robinhood chain + BIO address to `packages/base-chain`; `defineChain(4663)` in `org-wallets` | Portal's deep link cannot show Robinhood BIO until Connect ships it. Genome has no chain-agnostic token registry yet; that is its own shared change per genome's commit rules. |

## 7. Architecture

### 7.1 Contract layer (deployment repo)

```
Ethereum (burning, v1.1.0)   Solana (burning, v2.0.0)   Base (burning, v1.1.0)   BSC (burning, version ?)
   NttManager 0x1783…   <-->   ntt11hd…            <-->   0x9AfE…            <-->   0x6915…
        \__________________________  new peer registered on every manager  ___________________/
                                                 |
                                 Robinhood Chain (wormhole 72, evm 4663)
                                 BIO ERC-20 (minter = NttManager, 18 dec)
                                 NttManager v2.0.0+evm (burning, threshold 1)
                                 WormholeTransceiver v2 -> Core Bridge 0x141f… (finalized)
                                 Executor 0xd19a… (inbound relays)
                                 [NttManagerWithExecutor — missing today]
```

Deployment inputs consumed by the NTT EVM deploy script (`evm/script/DeployWormholeNtt.s.sol`,
`DeployWormholeNttBase.sol` `DeploymentParams`): token, mode, Wormhole chain ID (72), rate-limit
duration, `wormholeCoreBridge`, `consistencyLevel`, CCL params (unused), outbound limit. The CLI
resolves the core bridge from `sdk-base` constants, hence the SDK ≥ 6.1.5 requirement.

`deployment.json` gains one `chains.Robinhood` entry of type `ChainConfig`
(`version, mode, paused, owner, pauser?, manager, token, transceivers.{threshold, wormhole}`,
`limits.{outbound, inbound{Ethereum,Solana,Base,Bsc}}`), and every existing chain entry gains
`limits.inbound.Robinhood` (`cli/src/limits.ts configureInboundLimitsForNewChain`). Before that,
the BSC entry that the widget already uses must be pulled into the file (R-C1).

### 7.2 Relay layer

- Executor route (`sdk-route-ntt/executor`): fetches `/v0/capabilities`; requires the **source**
  chain to be listed and the **destination** to advertise request prefix `ERN1`; sends through the
  per-chain `NttManagerWithExecutor` helper on the source chain, which wraps the standard NTT
  `transfer` and the Executor `requestExecution` in one call and can charge a referrer fee
  (`dbps`, tenths of a basis point, paid to `payee`). Inbound to Robinhood needs: Executor contract
  on Robinhood (✅) + capabilities entry for 72 (UNVERIFIED). Outbound from Robinhood additionally
  needs the helper (❌ today).
- Manual route (`sdk-route-ntt/manual`): user submits on source, waits for the VAA, redeems on the
  destination paying destination gas. Needs only the Core Bridge, so it works on Robinhood as soon
  as peers are registered. Executor transfers whose relay fails can also be completed manually via
  `resume()` / `complete()`.

### 7.3 UI layer

Option A (preferred, upstream-dependent): `wormhole.config.ts` adds `"Robinhood"` to `chains`,
`rpcs.Robinhood` (`NEXT_PUBLIC_ROBINHOOD_RPC_URL`), a `BIOrobinhood` `tokensConfig` entry, and a
fifth `BIO_NTT` element `{ chain: "Robinhood", manager, token, transceiver }`. A ~30-line diff once a
Connect release ships Robinhood.

Option B (fallback): a `/robinhood` route in this Next app that instantiates
`wormhole("Mainnet", [evm])` from `@wormhole-foundation/sdk@≥6.1.5` with the BIO NTT config,
resolves `NttExecutorRoute` (else `NttManualRoute`) for `Ethereum ↔ Robinhood`, and drives
quote → initiate → track with an injected EIP-1193 signer. Two SDK majors in one bundle (Connect's
4.9.1 and our 6.x) must be code-split by route. This is the only way to ship before upstream moves.

## 8. Requirements

Prefix key: **C** contracts, **R** relay, **U** UI, **G** genome/ecosystem, **O** ops, **T** testing,
**S** security. *Must* = spike exit criterion; *Should* = spike if cheap, else follow-up.

### Contracts

- **R-C1 (Must)** Run `ntt pull` in `Wormhole-NTT-Deployments/BIO` and commit the result: it must
  add the live BSC chain, and record actual mode/version/owner/pauser/threshold/limits for all
  chains. Resolve whether `0x9eC0…` is an EOA or a Safe.
- **R-C2 (Must)** NTT CLI must resolve `Robinhood`: upstream bump of the CLI `overrides` to
  `sdk-* ≥ 6.1.5` (small PR to `native-token-transfers`) or a local checkout with the same override.
  Verify with `ntt status` naming `Robinhood`.
- **R-C3 (Must)** Confirm with Wormhole which NTT EVM version to deploy on Robinhood and that it
  peers with the v1.1.0 EVM managers; record the answer in the deployment repo.
- **R-C4 (Must)** Deploy the BIO ERC-20 on Robinhood with mint/burn restricted to the NttManager,
  18 decimals; verify source on Blockscout.
- **R-C5 (Must)** `ntt add-chain Robinhood --token <addr> --mode burning --ver <agreed>` with an
  `overrides.json` RPC (Alchemy or self-hosted; the public RPC is rate-limited), standard finality
  (no `--unsafe-custom-finality`).
- **R-C6 (Must)** Register Robinhood peers and inbound limits on Ethereum, Solana, Base and BSC
  (`ntt push`, or Safe transactions per the signing decision), and set the outbound limit on
  Robinhood to the agreed launch value (Q-O1).
- **R-C7 (Must)** Transfer Robinhood manager/transceiver/token ownership to the same ownership
  model as Base/BSC; set a pauser distinct from the owner where possible.
- **R-C8 (Should)** Deterministic deploy so the Robinhood BIO address equals `0x226A…7DD2`.
- **R-C9 (Must)** Commit the updated `deployment.json` and addresses to the deployment repo;
  mirror them into `src/wormhole.config.ts`.

### Relay

- **R-R1 (Must)** Confirm `GET https://executor.labsapis.com/v0/capabilities` lists chain `72`,
  its request prefixes (`ERN1`), gas-drop-off limit and allowed fee tokens. Record the response.
- **R-R2 (Must)** Ask Wormhole Labs to deploy `NttManagerWithExecutor` on Robinhood and add it to
  `sdk-evm-ntt`'s address table; until then Robinhood-sourced transfers use the manual route.
- **R-R3 (Should)** Decide on an Executor referrer fee for Bio (`dbps` + payee); the SDK default
  referrer is Wormhole's address (Q-R1).
- **R-R4 (Must)** Measure and document end-to-end latency both ways. Guardians wait for L1
  `finalized` on Orbit chains (Wormhole docs quote 15–20 minutes for Ethereum L2s), so the UI must
  set that expectation for Robinhood → X.

### UI

- **R-U1 (Must)** Robinhood Chain is a selectable chain for BIO only, with icon, explorer links
  (`robinhoodchain.blockscout.com`) and ETH as gas symbol.
- **R-U2 (Must)** Wallet connection prompts `wallet_addEthereumChain` for 4663 with the RPC and
  explorer above when the wallet lacks the chain.
- **R-U3 (Must)** RPC via `NEXT_PUBLIC_ROBINHOOD_RPC_URL` (same pattern as the four existing
  `rpcs` entries); never hardcode a keyed URL.
- **R-U4 (Must)** Route selection surfaces Executor when available, manual otherwise, and the
  manual path guides the user through redeem on the destination.
- **R-U5 (Should)** Upstream: open a `wormhole-connect` issue/PR adding the `Robinhood` chain
  entry (`displayName`, `sdkName`, `explorerUrl`, `explorerName`, `icon`, `symbol: 'ETH'`,
  `gasReserve`) plus an `sdk-icons` icon, and note the SDK bump past 6.1.5 it needs.
- **R-U6 (Should)** If Option B is built, keep it BIO-only, behind a feature flag, and delete it
  when Option A lands.

### Genome / ecosystem (follow-up PRs, not spike exit criteria)

- **R-G1** Repoint `BIO_ECOSYSTEM_URLS.bridge` to this deployment and make the three footer copies
  import the catalog.
- **R-G2** Add Robinhood Chain (4663) and the Robinhood BIO address to a chain-agnostic token
  registry (extend `packages/base-chain` or its successor) and a `defineChain` in `org-wallets`.
- **R-G3** Add the bridge to `ABOUT_NETWORK_ITEMS` so it appears in About and `llms.txt`.

### Ops

- **R-O1 (Must)** Runbook: pause/unpause the Robinhood manager (`paused: true` + push, or Safe
  call), raise/lower limits, rotate RPC, and how to find chain-72 VAAs on Wormholescan.
- **R-O2 (Should)** Alert on Robinhood block-production stalls (precedent: 14-minute halt on
  2026-09-04) and on Executor quote failures for chain 72.
- **R-O3 (Must)** Record every deployed address and tx hash in the deployment repo README.

### Testing

- **R-T1 (Must)** Accept that there is no Wormhole testnet for Robinhood: the spike tests on
  mainnet with small amounts and tight limits. Matrix: Ethereum→Robinhood (Executor),
  Robinhood→Ethereum (manual, or Executor per R-R2), one Base/BSC pair, a rate-limit hit and queue
  release, pause behaviour.
- **R-T2 (Should)** Rehearse `add-chain` / `push` with the chosen CLI + SDK versions on a
  throwaway deployment using **Arbitrum Sepolia** (Orbit stack, Executor and `NttManagerWithExecutor`
  exist on testnet) before touching the BIO deployment.

### Security

- **R-S1 (Must)** The owner keys used for peering on Ethereum/Solana/Base/BSC are the production
  owners; confirm signer custody before the ceremony. No agent runs these transactions.
- **R-S2 (Must)** User-facing docs state that Robinhood Chain is a single-sequencer L2 with a
  transaction filterer and permissioned validators (L2BEAT "Other"); BIO on Robinhood inherits
  that trust model in addition to Wormhole's 13/19 guardian quorum.
- **R-S3 (Should)** Verify the Core Bridge at `0x141f…` on Blockscout matches
  `.env.robinhoodchain.mainnet` (chain 72, EVM 4663) before pointing the transceiver at it.

## 9. Delivery phases and rough sizing

| Phase | Work | Depends on | Size |
|---|---|---|---|
| 0. Unblock | R-C1, R-C2, R-C3, R-R1; open upstream asks (R-U5, R-R2) | — | 1–2 days of work, plus Wormhole response time |
| 1. Contracts | R-C4…R-C9, R-S1, R-S3 | Phase 0, owner signers available | 2–3 days incl. ceremony |
| 2. Relay validation | R-R4, R-T1 | Phase 1 | 1 day |
| 3a. UI via Connect | `wormhole.config.ts` edit, R-U1…R-U4 | Connect release with Robinhood + SDK ≥ 6.1.5 (**not in our control**) | 0.5 day once released |
| 3b. UI fallback | Option B page, R-U6 | Phase 1 | 3–5 days |
| 4. Ecosystem | R-G1…R-G3, R-O1…R-O3 | Phase 3 | 1–2 days |

Critical path is Phase 0 → 1 → 2; the UI choice (3a vs 3b) is decided by upstream timing at the
end of Phase 2.

## 10. Accepted risks

- Mainnet-only testing (no testnet). Mitigated by tight limits and an Arbitrum Sepolia rehearsal.
- Version skew: a v2 EVM manager on Robinhood peering with v1.1.0 EVM managers elsewhere.
- Upstream dependency on Connect and the Executor helper; the fallback UI is throwaway work.
- Robinhood Chain operational maturity (young chain, single sequencer, recent outage).
- Deployment repo drift (BSC missing) means the first `ntt pull` may surface more surprises.
- Two Wormhole SDK majors in one bundle if Option B ships.

## 11. Open questions

**Contracts**

- **Q-C1** What does `ntt pull` return for BSC (version, mode, owner, limits), and is anything else
  drifted from `deployment.json`?
- **Q-C2** Who holds the deployer key/nonce (or CREATE2 factory) used for the Base/BSC BIO token,
  and do we want address parity on Robinhood?
- **Q-C3** Is `0x9eC0B6aE…99b5` an EOA or a Safe? Who can sign for it, and for the Solana owner
  `man5NNs4…CcJ`?
- **Q-C4** Is Safe (or whichever multisig we use) deployed on Robinhood Chain?
- **Q-C5** Which NTT EVM version does Wormhole recommend for a new spoke next to v1.1.0 managers,
  and is v2 ↔ v1.1.0 EVM peering supported?

**Relay**

- **Q-R1** Do we want an Executor referrer fee for Bio, and to which payee?
- **Q-R2** Wormhole Labs timeline for the `NttManagerWithExecutor` helper on Robinhood and for
  Connect adding Robinhood.

**Product / ops**

- **Q-O1** Launch rate limits (outbound on Robinhood, inbound on each existing chain) and who
  approves changes.
- **Q-O2** Which chains the UI should expose for Robinhood in the spike (Ethereum only vs all).
- **Q-O3** Who are "our users" on Robinhood Chain in practice — Robinhood Wallet users, or users
  bridging out to trade on Robinhood Chain DEXs — and does that change the default direction?
- **Q-O4** Repoint the genome portalbridge links now (Portal cannot show Robinhood BIO yet) or in
  Phase 4?

**Unverified facts to close out**

- Executor capabilities for chain 72 (R-R1).
- Official Robinhood JSON-RPC WSS endpoint.
- Verified source of the Base/BSC BIO token contract.
- Whether the Wormhole "Supported Networks" page lists Robinhood NTT as GA (docs data says
  `ntt.mainnet: true`).
