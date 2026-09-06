# Robinhood Chain BIO Bridge — Design & Requirements (Spike Scoping)

**Date:** 2026-09-06 (revision 2, after adversarial verification)
**Status:** Draft — scoping input for the implementation spike
**Scope:** the BIO NTT deployment (`bio-xyz/Wormhole-NTT-Deployments/BIO/deployment.json` and the
managers on Ethereum/Solana/Base/BSC, plus a new Robinhood spoke), this repo
(`src/wormhole.config.ts`, `src/App.tsx`, deployment), and follow-up touchpoints in
`bio-xyz/genome`.

Every fact carries a source. Revision 2 was produced by six independent verification passes that
tried to refute each claim of revision 1; refuted or weakened claims were corrected in place and the
material changes are listed in §13. Facts still not verifiable from a primary source are marked
**UNVERIFIED** and repeated in §11.

---

## 1. Problem

Bio users can bridge BIO between Ethereum, Solana, Base and BSC through this Wormhole Connect
widget, backed by a Wormhole **Native Token Transfers (NTT)** burn-and-mint deployment. Robinhood
Chain (an Arbitrum Orbit L2 operated by Robinhood, public mainnet since 2026-07-01) is a new
distribution surface. The first spike must let a user move BIO between Robinhood Chain and at least
one existing BIO chain using the same NTT deployment, without introducing a second bridge stack or a
second BIO asset, and without weakening the safety of the existing four chains.

The spike is **not reversible** in one respect: registering a Robinhood peer on the existing
Wormhole transceivers is a one-shot write (§6, §8 R-S4). The spec is organised around that fact.

## 2. Current state

### 2.1 Bridge UI (`bio-xyz/wormhole-bridge-ui`)

- Static Next.js 15 export (`output: "export"`) that client-side-renders (`ssr: false`) a thin
  BIO-branded shell around `<WormholeConnect config={wormholeConfig} theme={...} />`.
- `@wormhole-foundation/wormhole-connect` **5.1.1**; the single registered route is
  `nttExecutorRoute` from `@wormhole-foundation/wormhole-connect/ntt` (migrated from Standard Relay
  in PR #10, 2026-04-16). **No manual route is registered.**
- Config surface is `src/wormhole.config.ts`: `network`, `chains`, `rpcs` (env-driven),
  `coingecko.apiKey`, `tokens`, `tokensConfig`, `ui` (incl. `defaultInputs` Ethereum→Solana and
  `walletConnectProjectId`), and one `nttExecutorRoute({ ntt: { tokens } })` block for BIO, GROW,
  QBIO, NEURON, AUBRAI. Chains today: `Ethereum`, `Solana`, `Base`, `Bsc`.
- Connect 5.1.1, 6.0.0 (newest release), and the `development` npm tag and branch all pin
  `@wormhole-foundation/sdk-*` **4.9.1** and `sdk-route-ntt` **4.0.14** exactly.
- `src/env.d.ts` still declares pre-Next `VITE_PUBLIC_*` names and no BSC variable; it is stale.

### 2.2 BIO NTT deployment (`bio-xyz/Wormhole-NTT-Deployments`, commit `d6171ab`)

`BIO/deployment.json` is the source of truth; read it rather than this section for values. The
repo is a vendored snapshot of the NTT monorepo (`ntt@0.5.0`, CLI `@wormhole-foundation/ntt-cli`
**1.1.0**, EVM contracts `NTT_MANAGER_VERSION`/`WORMHOLE_TRANSCEIVER_VERSION` **1.1.0**) with a
single squashed commit and **no git tags**.

What the file says (snapshot at `d6171ab`):

| Chain | Version | Mode | Outbound limit | Inbound limits |
|---|---|---|---|---|
| Ethereum | 1.1.0 | burning | 66 400 000 | Solana, Base: 66 400 000 |
| Solana | 2.0.0 | burning | 66 400 000 | Ethereum, Base: 66 400 000 |
| Base | 1.1.0 | burning | 184 467 440 737.09551615 (= uint64 max × 10⁻⁸ scaled: the deploy-script default, not a chosen value) | Ethereum, Solana: 66 400 000 |

Owner and pauser on Ethereum and Base: `0x9eC0B6aE27214d45cA4A26e52E0Efb9f8a9099b5` (EOA vs Safe
**UNVERIFIED**). Solana owner `man5NNs4NvVgczbEpxFxjGXCSwCEx8rrN4eRkR26CcJ`; the Solana NTT program
has no pauser role (owner-only pause). Threshold 1 everywhere. Decimals (18/9/18) are inferred from
the limit strings and the widget's `tokensConfig`, not stored in the file.

Facts that drive decisions:

- **BIO is burn-and-mint on all three recorded chains; there is no locking hub.** The NttManager
  is a minter of BIO on Ethereum too (`NttManager.sol` `mint` in `BURNING` mode). GROW is `locking`
  on Ethereum; QBIO is `burning`.
- **BSC is absent from `deployment.json`**, and no chain records a `limits.inbound.Bsc`, yet the
  widget carries a live BSC manager `0x6915fE8Dad5d32C2EE961e2F432d7DD5916316de` and transceiver
  `0x86206f8813a1a4201420d67b75c27CCa0ff2A836`. `ntt pull` only refreshes chains already in the file,
  so it cannot add BSC by itself (R-C1). BSC's mode and version are unknown; NTT allows one locking
  chain, so BSC is the one place a locking hub could hide.
- **Solana version is ambiguous**: the file says 2.0.0, the repo carries a committed
  `.deployments/Solana-2.1.0/` worktree, and the program crates say 3.0.0.
- Base and BSC BIO share address `0x226A2FA2556C48245E57cd1cbA4C6c9e67077DD2` while AUBRAI uses
  different addresses on the same two chains, so BIO's parity was a deliberate deploy choice
  (CREATE2 or controlled nonce) held by whoever ran it (Q-C2).
- Per-token owners differ across the repo (BIO, GROW, QBIO each have their own EVM and Solana
  owners); custody questions are per token, not one signer.

### 2.3 `bio-xyz/genome` monorepo

No bridge, Wormhole or NTT code exists in genome (case-insensitive repo search, word-bounded for
`ntt`). Touchpoints a new chain eventually hits:

- `packages/utils/src/bio-ecosystem-urls.ts` — `BIO_ECOSYSTEM_URLS.bridge` deep-links
  **portalbridge.com** (Ethereum→Solana), not this deployment. The identical URL is duplicated in
  `packages/buildspace-ui/src/components/buildspace/text.json`, `apps/buildspace/lib/text.json`, and
  `apps/openlabs/lib/texts.ts`. This is wrong today independent of Robinhood (R-G1).
- `packages/base-chain/src/tokens.ts` — the only typed BIO token registry (Base only). Ethereum
  and Solana BIO addresses exist nowhere else in genome but inside that portalbridge query string.
- `packages/openlabs-contracts/src/networks.ts` — house pattern for a chain missing from
  `viem/chains` (`defineChain` + `SUPPORTED_CHAINS` + `resolveChain`).
- `packages/org-wallets/src/hooks/use-linked-wallet-client.ts` — `wallet_switchEthereumChain` with
  `wallet_addEthereumChain` fallback, **but** `viemChainForId` is a hardcoded allowlist of Base and
  Base Sepolia that throws for any other id; a `defineChain` alone is not enough.
- `apps/www/src/components/AboutNetworkCard.tsx` (`ABOUT_NETWORK_ITEMS`) feeds the About grid,
  `llms.txt`, **and** the homepage JSON-LD ecosystem catalog (`apps/www/src/app/page.tsx`); genome's
  `AGENTS.md` requires the three kept in sync. The bridge is not listed today.
- Spec convention in genome is `docs/superpowers/specs/<date>-<topic>-design.md`; this document
  follows the filename convention in this repo's `docs/specs/`. Work is tracked in Linear per
  `.cursor/rules/linear.mdc`.

## 3. Robinhood Chain — fact sheet

Primary machine-readable sources: ethereum-lists/chains `eip155-4663.json` and `eip155-46630.json`;
OffchainLabs/arbitrum-portal `orbitChainsData.json`; l2beat `projects/robinhood/robinhood.ts` and
`discovered.json`; hyperlane-registry `chains/robinhood/*`; wormhole `node/pkg/watchers/evm/chain_config.go`.
Items marked ⚠ were only reachable through search-engine renderings of `docs.robinhood.com` /
`robinhood.com`, which were blocked from this environment.

| Item | Value | Source |
|---|---|---|
| Stack | Arbitrum Nitro / Orbit, ArbOS 61 (on-chain `wasmModuleRoot`), Rollup posting EIP-4844 blobs (`postsBlobs: true`, empty DAC keyset — not AnyTrust), settling directly to Ethereum L1 | l2beat `discovered.json`, `robinhood.ts`; orbitChainsData `parentChainId: 1` |
| Exit window | `confirmPeriodBlocks` 45818 (≈6.4 days) + `challengeGracePeriodBlocks` 14400 (≈2 days) | orbitChainsData; l2beat `discovered.json` |
| Mainnet chain ID | **4663**, gas token ETH | `eip155-4663.json`; wormhole `chain_config.go` |
| Testnet chain ID | **46630** (Sepolia parent, `confirmPeriodBlocks` 20). Third-party pages quoting 46646 are wrong (no such registry entry) | `eip155-46630.json`, arbitrum-portal `ChainId.ts` |
| History | L1 rollup contracts deployed 2026-04-30; public testnet 2026-02-10; public mainnet 2026-07-01 (transaction-access whitelist removed) | l2beat `addedAt`, milestones; Robinhood newsroom ⚠ |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` (l2beat throttles it to 600 req/min; Robinhood publishes no limit we could fetch). Testnet `https://rpc.testnet.chain.robinhood.com/rpc`. Robinhood names Alchemy, QuickNode, Blockdaemon, dRPC and Validation Cloud as production providers ⚠; Alchemy's mainnet hostname is **UNVERIFIED** (only the testnet host was attested) | `eip155-4663.json`; l2beat `chainConfig`; Robinhood docs ⚠ |
| WSS | Community `wss://robinhood-rpc.publicnode.com` (testnet `wss://robinhood-sepolia-rpc.publicnode.com`); keyed WSS via Alchemy ⚠; no free official JSON-RPC WSS found. Sequencer-feed WS (`wss://feed.mainnet.chain.robinhood.com`) is not JSON-RPC | ethereum-lists; Robinhood full-node docs ⚠ |
| Explorer | Canonical `https://robinhoodchain.blockscout.com` (Blockscout; verify with `forge verify-contract --verifier blockscout --verifier-url https://robinhoodchain.blockscout.com/api/`, no API key documented). `robinscan.io`, `hoodscan.co` are third-party; hyperlane's `explorer.chain.robinhood.com` is uncorroborated — do not use for R-S3 | l2beat `explorerUrl`/`apis`; `eip155-4663.json`; hyperlane metadata |
| Block time / ordering | ~100 ms blocks; FCFS sequencer ordering with no priority auction — a chain-owner policy (ArbOS 61 supports priority fees upstream), so it can change | wormhole `finality.js`; Robinhood gas docs ⚠ |
| Gas | ETH; base fee floor 0.02 gwei but median ~0.47 gwei with spikes >5 gwei in early Sept 2026 (secondary sources) — volatile; affects Executor quotes and redeem costs | The Defiant / Bitquery (secondary) |
| `block.number` | L1 block estimate (Arbitrum semantics); L2 height via `ArbSys` at `0x…64` (`100`). Guardians use RPC block tags, so NTT is unaffected | Robinhood docs ⚠; arbitrum-docs |
| Trust caveats | Robinhood runs the sequencer (`sequencerFailure: 'No mechanism'`); ArbOS 61 `TransactionFilterer` role can nullify force-included txs; validator whitelist enabled; L2BEAT "Other" (closed proofs) | l2beat `robinhood.ts`, `discovered.json` |
| Incidents | Block-production disruption on 2026-09-04 reported as 4–14 minutes by secondary outlets; Offchain Labs characterised it as batch-posting delays, not downtime. **Robinhood runs no public status page for the chain** | crypto press (secondary) |
| Safe | Canonical Safe v1.4.1 L2 singleton deployed on **4663 and 46630** | safe-global/safe-deployments `v1.4.1/safe_l2.json` |
| Robinhood app | Brokerage crypto transfers on Robinhood Chain listed ETH, USDG, CASHCAT (not available in New York) at the time of writing ⚠; arbitrary ERC-20s reach users through Robinhood Wallet (self-custody) or any EVM wallet | Robinhood support articles ⚠ |
| Other bridges live | Arbitrum canonical bridge (router `0x6a2E3a1e…`); Chainlink CCIP (router `0x06fC836c…`, selector `6180753054346818345`); LayerZero V2 (EID 30416); Hyperlane (Mailbox `0x3a867fCf…`); Across (`family: ORBIT`). **No CCTP** (`cctpDomain: CCTP_NO_DOMAIN`) | smartcontractkit/documentation ccip chains.json; `@layerzerolabs/lz-definitions`; hyperlane-registry; `@across-protocol/constants` |
| Wormhole announcement | None found. Chain 72 was a quiet protocol-layer onboarding (guardian config + core bridge). The only Robinhood/Wormhole news is the 2025 W token listing | — |

## 4. Wormhole support matrix for Robinhood Chain

Verified against `@wormhole-foundation/sdk-base@6.1.5`, `sdk-route-ntt@8.0.1`, `sdk-evm-ntt@8.0.1`,
`sdk-icons@6.1.5` (all npm), `wormhole-connect` (npm + `development` branch),
`native-token-transfers` (`main`, tags `v1.1.0+evm`, `v2.0.0+evm`), and `wormhole` (`main`).

| Component | Robinhood status | Evidence |
|---|---|---|
| Wormhole chain ID | **72**, TS name `Robinhood` (Go `ChainIDRobinhoodChain`, env `CHAIN_NAME=Robinhood Chain`), platform `Evm`, **Mainnet only** | `sdk/vaa/structs.go`; `chains.js`; `nativeChainIds.js` (Mainnet block only) |
| Core Bridge | ✅ `0x141fBa8AD5D61bdaB45A047cF60b5Ad9784987FB` | `contracts/core.js`; `ethereum/env/.env.robinhoodchain.mainnet` (`INIT_CHAIN_ID=72`, `INIT_EVM_CHAIN_ID=4663`; no `BRIDGE_INIT_*`; no testnet env file) |
| Guardian observation | ✅ watcher `{Finalized: true, Safe: true, EvmChainID: 4663}` since guardian v2.67.0 (2026-08-04, PR #4920). Guardians poll Robinhood's own `finalized` tag every 1 s; there is no Orbit-specific finalizer | `chain_config.go`; `watchers/evm/watcher.go`, `connectors/poller.go` |
| **Delegated guardian set** | ⚠ Chain 72 is observed by a **delegated set of 7 guardians with threshold 5** (`dgs10`, governance VAA signed 13/19, guardian v2.68.0, 2026-09-04). Canonical guardians run no Robinhood watcher and sign on delegate consensus; the Notary is skipped on that path | `guardianset/mainnetv2/delegated_sets/dgs10.prototxt`; `node/pkg/processor/processor.go`, `observation.go` |
| Executor contract | ✅ `0xd19aAd5a69F7D35Cee169D9D90e1BbCB795ABB38` | `contracts/executor.js` |
| Executor API capabilities for chain 72 (`GET https://executor.labsapis.com/v0/capabilities`; destination must advertise `ERN1`) | **UNVERIFIED** — host blocked from this environment for curl and WebFetch. Canonical browser: Executor Explorer (`wormholelabs-xyz.github.io/executor-explorer`) | `sdk-route-ntt/executor/executor.js`; `wormhole-docs` `reference/executor-addresses.md` |
| `NttManagerWithExecutor` helper on Robinhood | ❌ not in `sdk-evm-ntt` 8.0.1 table (27 mainnet chains). The helper is an Apache-2.0, stateless, **permissionless** shim (`constructor(uint16 chainId, address executor)`, no owner) that anyone can deploy | `sdk-evm-ntt/nttWithExecutor.js`; `wormholelabs-xyz/example-ntt-with-executor-evm` `src/v2/NttManagerWithExecutor.sol` |
| Standard Relayer, Token Bridge, CCL, executorQuoter, CCTP, tbtc, portico, rollupCheckpoint, nftBridge, gateway | ❌ absent from all 13 other per-chain contract tables | `sdk-base` `contracts/*.js` |
| Testnet entry | ❌ none in any table; docs data `ntt.testnet: false` | `sdk-base`; `wormhole-docs/dev/scripts/src/chains/Robinhood.json` |
| Governor | not listed — **irrelevant**: the Governor only gates Token Bridge transfers (`IsTransfer` + `KnownTokenbridgeEmitters`), never NTT | `node/pkg/governor/governor.go`, `mainnet_chains.go` |
| NTT Accountant | ❌ per-deployment emitter allowlist (W, wstETH, mUSD only); BIO has no accountant coverage on any chain | `node/pkg/accountant/ntt_config.go` |
| SDK finality constants | 4096 blocks × 100 ms ⇒ `estimateFinalityTime` ≈ 6.8 min. **Too optimistic**: chosen by block-time analogy to Converge/MegaETH; other L1-finality chains land at ~17–18 min (Arbitrum 4096 × 260 ms). Do not surface this estimate | `finality.js` |
| Chain icon | ✅ present in `sdk-icons@6.1.5` | `dist/esm/constants/chainIcons.js` |
| **First SDK version with Robinhood** | `sdk-base` **6.1.5** (2026-07-29, wormhole-sdk-ts PR #1031); 5.2.0 → 6.1.4 contain no Robinhood bytes; 6.1.5 is `latest` | npm bisect |
| Wormhole Connect (5.1.1, 6.0.0, `development` tag and branch) | ❌ pins SDK **4.9.1** (63 chains, zero Robinhood bytes); static `MAINNET_CHAINS` (34 entries) has no Robinhood; `chains` config is a plain `.filter` over that map and drops unknown names silently; `WormholeConnectConfig` exposes no custom-chain definition, `sdkConfig` override, or config-overrides hook | Connect `src/config/index.ts`, `types.ts`, `mainnet/chains.ts` |
| NTT CLI (`main`, v1.7.0) | ⚠️ ~28 exact `6.1.4` pins across 7 `package.json` files (repo ships `setSdkVersion.ts` for this). `ntt add-chain Robinhood` is rejected at argument parse by yargs `choices: chains` (`cli/src/commands/shared.ts`); `chainToPlatform("Robinhood")` returns `undefined` (does not throw) and the SDK then fails with `Not able to retrieve platform undefined`. `overrides.json` can inject a core-bridge address but cannot make the chain name valid | `cli/package.json`; `cli/src/commands/shared.ts`; sdk-connect `config.js` |
| `sdk-route-ntt` / `sdk-evm-ntt` 8.0.1 | ⚠️ peer-pin `sdk-base`/`sdk-connect` **6.1.4**; 8.0.1 was published 2026-07-28, one day before 6.1.5. `npm i sdk-base@6.1.5 sdk-route-ntt@8.0.1` fails with `ERESOLVE` without overrides | npm |
| NTT EVM version on Robinhood | v1.1.0 **can** be deployed with `address(0)` relayers (no zero-check in constructor, `_checkImmutables`, or deploy script; relaying flags default false so `_quoteDeliveryPrice` returns `messageFee()` and sends take the plain `publishMessage` path). The **current** CLI already passes `address(0)` for both relayers when deploying v1.x. v2.0.0+evm (`--latest`; `main` is untagged 2.0.1) removed the relayer immutables and added CCL (PR #772). Message encoding is **byte-identical** across v1.1.0, `v2.0.0+evm` and `main` (`TransceiverStructs.sol` md5 `099cbe00…`; prefixes unchanged; v2's optional `additionalPayload` encodes to the v1 layout when empty, which the standard v2 manager always does) | local `BIO/evm/src/**`; NTT repo; `sdk/__tests__/utils.ts` |
| Wormhole docs product data | NTT mainnet ✅, testnet ❌, MultiGov ✅; no `connect`/`tokenBridge`/`cctp` keys. (No `queries` key exists in this schema; Queries support for chain 72 is a separate **UNVERIFIED** question) | `wormhole-docs/dev/scripts/src/chains/Robinhood.json` |
| Existing NTT on Robinhood | **None verified.** The $PONS deployment publicised by Wormhole is `ethereum:0x07f5b…2241` → Solana; PONS is the token of a launchpad that runs on Robinhood Chain, which is a different claim | Wormhole / Sunrise posts (snippets) |
| Orbit precedent | Plume (Wormhole 55, Orbit with custom gas token) has Core, Standard Relayer, `NttManagerWithExecutor` (mainnet + testnet), a full testnet stack and NTT, but **no mainnet Executor contract** — the inverse of Robinhood's gap. Plume is not a delegated-guardian chain. It proves Orbit+NTT is a supported shape; it predicts nothing about Robinhood's gaps closing | `sdk-base`, `sdk-evm-ntt`, `dgs10.prototxt` |

**Consequence.** The chain is onboarded at the protocol layer (Core + delegated guardians +
Executor contract), but: no tooling we use knows it (Connect, released NTT CLI, Executor helper
table); no NTT deployment on chain 72 is verified to exist; and Robinhood-origin VAAs carry a
5-of-7 delegated trust model with no Governor or Accountant backstop. The NTT inbound rate limits
for Robinhood on the four existing managers are the **entire** supply guard.

## 5. Goals / Non-goals

### Goals

1. A user can move BIO between Ethereum and Robinhood Chain in both directions; peers are
   registered on all existing managers at once, and UI exposure of Base/BSC/Solana pairs is staged.
2. Robinhood Chain BIO is part of the **same NTT deployment** (same `deployment.json`, same
   burn-and-mint accounting), not a wrapped or separately-issued asset.
3. Transfers are relayed automatically (Executor) where the Executor supports the pair; manual
   redeem is acceptable for the spike where it does not, and is always available as a fallback.
4. The spike's deliverable is a **measured, scripted round-trip** plus the ops runbook and
   kill-switch, recorded in the deployment repo. UI exposure follows at a dated gate (§9).
5. Ops can pause, rate-limit and monitor the new spoke like the existing ones **before** the first
   public transfer.

### Non-goals

- Portal Bridge / Token Bridge wrapped BIO on Robinhood (Token Bridge is not deployed there).
- Robinhood *testnet* bridging (Wormhole has no testnet entry for Robinhood).
- Bridging GROW, QBIO, NEURON or AUBRAI to Robinhood.
- Listing BIO inside the Robinhood brokerage app (Robinhood's decision).
- Replacing Connect for the existing four chains.
- Upgrading the existing v1.1.0 managers on Ethereum/Base/BSC (see §6: this no longer forces a
  version-compatibility unknown onto the critical path).

## 6. Key decisions

| Decision | Choice | Rationale / alternatives rejected |
|---|---|---|
| Bridging mechanism | **NTT spoke on Robinhood, `burning` mode**, wired into the existing deployment | Only NTT is live on Robinhood. Every recorded BIO chain is `burning`. Note the CLI only force-defaults `burning` once a locking chain exists; with none, `--mode burning` must be passed explicitly and nothing stops an accidental `--mode locking`. |
| Token contract on Robinhood | NTT-compatible ERC-20: `mint(address,uint256)` restricted to the NttManager, standard `ERC20Burnable` `burn(uint256)` (the manager burns from its own balance; `setMinter` is optional per `INttToken.sol`), name/symbol/decimals identical to Base/BSC BIO (18). Reuse the verified Base/BSC source, else `PeerToken` from `wormhole-foundation/example-ntt-token-evm`. Address parity with `0x226A…7DD2` is a **security item**, not a nicety (§10) | Two BIO addresses across EVM chains is a phishing and mis-send surface. Parity needs whoever ran the Base/BSC deploy (Q-C2). |
| NTT contract version on Robinhood | **v2.0.0+evm** (`--ver 2.0.0`, not `--latest`), chosen on maintenance grounds: current release tag, no dead relayer immutables, CCL available if ever needed. **v1.1.0 is also viable** (zero relayers, relaying off) and is what the current CLI deploys for v1.x tags | Revision 1 claimed v1.1.0 "requires" relayer addresses; that was wrong. Cross-version peering is verified from source (byte-identical encoding; Solana 2.0.0 already peers with EVM 1.1.0 by the same mechanism). A courtesy confirmation from Wormhole is still requested (R-C3) but no longer gates the spike. `--latest` sorts tags lexicographically; pin explicitly. |
| Consistency level | `finalized` (202, hardcoded default in script and CLI), **no CCL**; pass `address(0)` for the CCL address — v2 only calls `configure` when level is 203 | No CCL contract on Robinhood; Guardians observe `finalized` anyway; docs recommend 202 and list sequencer censorship and L1-reorg-without-resubmit as the L2 risks — both map onto §3's trust caveats. |
| Relay | Executor route both ways. Inbound to Robinhood needs the Executor contract (✅) and a capabilities entry for 72 (**UNVERIFIED**, R-R1). Outbound from Robinhood needs the `NttManagerWithExecutor` shim, which **Bio deploys itself** (permissionless, forge script provided) and then gets into `sdk-evm-ntt`'s address table (upstream PR for Connect; local patch for a custom UI). If capabilities omit 72, the spike is manual-route-only in both directions and the UI scope changes accordingly | Revision 1 treated the shim as a Wormhole Labs dependency; it is not. The genuinely external dependency is the Executor capabilities entry. |
| Peer registration | Register Robinhood as peer on **all** existing managers and transceivers in one ceremony, after fork simulation, with UI exposure staged | `setWormholePeer` is **one-shot per chain** (`PeerAlreadySet`; the in-code remedy is redeploying the transceiver). Partial peering leaves `deployment.json` inconsistent. |
| Signing model | `ntt push` signs with `ETH_PRIVATE_KEY` and requires it to be the owner or an `INttOwner`-style `execute(address,bytes)` contract (not shipped by Wormhole); `--signer-type ledger` throws on EVM; no dry-run or calldata export. If `0x9eC0…` is a Safe, the ceremony is manual Safe transactions: `setPeer(72, peer, 18, inboundLimit)` on each manager, `setWormholePeer(72, transceiver)` on each transceiver, `setOutboundLimit` on Robinhood, and `setInboundLimit` adjustments. `setIsWormholeEvmChain`/`setIsWormholeRelayingEnabled` are **not** needed (current CLI never sets them; absent from v2; only matter when standard relaying is enabled) | Safe exists on Robinhood (§3), so a Safe-owned spoke is viable. Whether Phase 1 is a CLI run or a multi-party ceremony depends on Q-C3, which is therefore a Phase 0 gate. |
| Rate limits at launch | Conservative outbound on Robinhood (**explicitly lowered** after deploy; the script defaults to uint64 max), and Robinhood inbound limits on Ethereum/Solana/Base/BSC set **well below** the 66.4 M used between existing chains | These limits are the only cap on a forged Robinhood-origin VAA under the 5-of-7 delegated set (no Governor, no Accountant). Limits cap **velocity, not cumulative exposure**: cancel-flows refill inbound capacity on outbound transfers, so a round-tripping actor can keep them refilled. `rateLimitDuration` (86400 s) is immutable at deploy. |
| Spike shape | **Contract-only spike**: deploy, peer, measure a scripted round-trip, rehearse the kill-switch. UI is decided at a dated gate after Phase 2 | Both UI options are blocked on things outside our control (Connect release; Executor capabilities) and the UI is the least informative part. What the spike must learn is whether the deployment survives a new spoke, whether the Executor covers 72, and real latency/cost. |
| UI end-state (Option A) | Upgrade this repo to the Connect release that adds Robinhood (chain entry + SDK bump past 6.1.5) and edit `wormhole.config.ts` (+ register `nttManualRoute`) | No config in Connect today can surface Robinhood. Forking Connect means owning a 4.9.1→6.x SDK migration of a large widget. Portal Bridge is the same Connect build. Option A has no owner or date upstream; it is the end-state, not the plan. |
| UI fallback (Option B) | A thin SDK-driven route page in this app for Robinhood pairs only (`@wormhole-foundation/sdk@≥6.1.5` + `sdk-route-ntt@≥8.0.1` with peer-dep overrides), behind a feature flag, deleted when Option A lands. **8–12 days**, not 3–5 | Needs wallet connect + add-chain 4663, approve/transfer, quote display, VAA tracking (Wormholescan dependency), manual redeem incl. destination gas, resume/complete, error taxonomy, and code-splitting two SDK majors. Built only if Phase 2 shows demand and Connect has not shipped. |
| Where genome changes land | Separate PRs, not in the spike: repoint `BIO_ECOSYSTEM_URLS.bridge` **now** (wrong regardless of Robinhood); chain/token registry and `viemChainForId` extension when the spoke is live | Genome's "shared changes in their own commit" rule; the portalbridge fix is out-of-scope work that must not ride on this spike. |

## 7. Architecture

### 7.1 Contract layer (deployment repo)

```
Ethereum (burning, v1.1.0)   Solana (burning, 2.0.0 or 2.1.0)   Base (burning, v1.1.0)   BSC (burning?, version ?)
   NttManager 0x1783…   <-->   ntt11hd…                   <-->   0x9AfE…            <-->   0x6915…
        \______________  Robinhood peer set ONCE on every manager + transceiver  _________________/
                                                 |
                                 Robinhood Chain (wormhole 72, evm 4663)
                                 BIO ERC-20 (minter = NttManager, 18 dec, same name/symbol)
                                 NttManager v2.0.0+evm (burning, threshold 1, lowered outbound)
                                 WormholeTransceiver v2 -> Core Bridge 0x141f… (CL 202)
                                 Executor 0xd19a… (inbound relays; capabilities UNVERIFIED)
                                 NttManagerWithExecutor v0.0.2 shim (Bio-deployed, CREATE2)
```

Tooling facts that shape Phase 0/1:

- The deployment repo cannot run versioned CLI commands: `--ver`/`--latest` resolve via
  `git tag --list 'v*+evm'` and `git worktree add` in the current root, and the repo has zero tags.
  Run the CLI from a `native-token-transfers` clone with `--path <…>/BIO/deployment.json`, or fetch
  upstream tags into the deployment repo (R-C0).
- `ntt add-chain` deploys manager + transceiver, pulls config, writes the chain entry, and prompts
  inbound limits for every pair involving the new chain — defaulting each to the destination's
  **outbound** limit (uint64 max on Base). Do not run it with `--yes`. It does not register peers.
- `ntt push` computes missing manager peers (decimals + inbound limit from the local file, 0 if
  absent) and transceiver peers for **every ordered pair**, and also pushes owner/pauser/paused/limits.
  `--only-chain` / `--skip-chain` narrow it. The **vendored 1.1.0 CLI** additionally calls
  `setIsWormholeRelayingEnabled(target, true)` for EVM→EVM pairs; the current CLI does not. Never run
  the vendored CLI against a Robinhood peer.
- Deploy inputs come from the CLI's bundled deploy script for the chosen version (the vendored
  v1.1.0 script is overwritten at deploy time). The Wormhole chain id is read on-chain from the core
  bridge; `rateLimitDuration` (86400) and the initial outbound limit (uint64 max) are hardcoded.
- The Solana program needs **no upgrade** for chain 72: `ChainId` is an opaque `u16` and peer PDAs
  are keyed by it; only the SDK needs the chain.
- `deployment.json` gains `chains.Robinhood` (`ChainConfig`) and every existing entry gains
  `limits.inbound.Robinhood`; the BSC entry and every `limits.inbound.Bsc` must be reconstructed
  first (R-C1).

### 7.2 Relay layer

- Executor route (`sdk-route-ntt/executor`): `quote()` fetches `/v0/capabilities` and throws
  `Unsupported source chain` if the source is absent or `Unsupported destination chain` if the
  destination lacks request prefix `ERN1`; `transfer()` then throws `Executor address not found` if
  the source chain has no `NttManagerWithExecutor` entry. The shim wraps NTT `transfer` and Executor
  `requestExecution` in one call and takes fixed `transferTokenFee`/`nativeTokenFee` referrer fees
  paid to a `payee` (shim v0.0.2; the older `dbps` model is v0.0.1 / the multi-token route), supplied
  by the single-token route's optional `getFee` callback. Default referrer with zero fee is
  Wormhole's address. Failed relays can be finished with `resume()`/`complete()`.
- Manual route (`sdk-route-ntt/manual`): source tx → VAA → destination redeem paying destination
  gas. Needs only the Core Bridge on-chain, **but** fetches the VAA through `api.wormholescan.io`,
  so Wormholescan must index chain 72 (**UNVERIFIED**, R-R7) or the operator must pull VAAs from a
  Guardian.
- Gas on arrival: an Executor recipient on Robinhood arrives with zero ETH; without a configured
  `gasDropOff` they cannot bridge back (R-R6). `sdk-evm-ntt` carries per-chain
  `executorGasLimitOverrides` (Arbitrum 800k); an Orbit chain may need one for 72 (R-R5).
- Latency: guardians release a Robinhood VAA when the L2 `finalized` tag covers the block, i.e.
  batch posted to L1 and that L1 block finalized — expect the Arbitrum-One regime (~18 min), not the
  SDK's 6.8 min estimate. Inbound to Robinhood is bounded by the source chain's finality (Ethereum
  ~18 min, Base ~17 min, Solana seconds).

### 7.3 UI layer

Option A: `wormhole.config.ts` adds `"Robinhood"` to `chains`, `rpcs.Robinhood`
(`NEXT_PUBLIC_ROBINHOOD_RPC_URL`), a `BIOrobinhood` `tokensConfig` entry, a fifth `BIO_NTT` element,
**and** registers `nttManualRoute` next to `nttExecutorRoute`; plus a Connect major upgrade from
5.1.1. Wallet add-chain behaviour is inside Connect's wallet aggregator, so R-U2 depends on the
upstream chain entry carrying RPC/explorer/native-currency data.

Option B: a `/robinhood` route instantiating `wormhole("Mainnet", [evm])` from
`@wormhole-foundation/sdk@≥6.1.5` with the BIO NTT config, `NttExecutorRoute` else `NttManualRoute`,
for `Ethereum ↔ Robinhood`, driving quote → initiate → track → (redeem) with an injected EIP-1193
signer and a locally patched `nttManagerWithExecutorAddresses`. Code-split from Connect's 4.9.1 SDK.

## 8. Requirements

Prefix key: **C** contracts, **R** relay, **U** UI, **G** genome/ecosystem, **O** ops, **T** testing,
**S** security. *Must* = spike exit criterion; *Should* = spike if cheap, else follow-up.

### Phase 0 gates (all Must; nothing in Phase 1 starts before these)

- **R-G0 (Must)** Demand check (Q-O3): name the user segment and the evidence that BIO on Robinhood
  Chain is wanted. This is the go/no-go for an irreversible change to three production transceivers.
- **R-C0 (Must)** Establish a runnable NTT root: a `native-token-transfers` clone at a pinned commit
  with SDK ≥ 6.1.5 (R-C2), operating on `BIO/deployment.json` via `--path`; record commit and
  invocation in the deployment repo.
- **R-C1 (Must)** Reconcile drift **before any push**: hand-add a `Bsc` stub
  (`manager: 0x6915fE8D…`) to `deployment.json`, run `ntt pull`, commit the result; confirm BSC's
  mode/version, every chain's `limits.inbound.Bsc`, the Solana version (2.0.0 vs 2.1.0), and whether
  `0x9eC0…` is an EOA or a Safe (Q-C3). `ntt push` before this step writes local guesses on-chain.
- **R-C2 (Must)** NTT CLI resolves `Robinhood`: mechanical PR (or local branch) bumping the ~28
  exact `6.1.4` pins to ≥ 6.1.5 via `setSdkVersion.ts`, rebuilding the workspace NTT packages.
  Verify `ntt status` lists `Robinhood`. `overrides.json` is not a workaround.
- **R-C3 (Must)** Written note from Wormhole confirming v2.0.0+evm is the recommended version for
  a new spoke next to v1.1.0 managers, whether anyone runs that pair in production, and whether
  fresh v1.1.0 deployments are still supported. Not a blocker for R-T2; a blocker for Phase 1.
- **R-R1 (Must)** Read Executor capabilities for chain 72 (request prefixes incl. `ERN1`,
  gas-drop-off limit, allowed fee tokens) via the Executor Explorer or `/v0/capabilities`; confirm
  Solana-source support for destination 72 separately. Record the responses. If 72 is absent, the
  spike is manual-only both ways.
- **R-R7 (Must)** Confirm `api.wormholescan.io` returns operations for chain 72 and the explorer
  renders them. If not, both UI options lose tracking and the runbook needs a Guardian VAA fetch.
- **R-S5 (Must)** Determine and document delegated guardian set 10's composition (7 keys,
  threshold 5, all members of the canonical 19) and how membership changes are communicated; feed
  R-S2 and R-O2.
- **R-T2 (Must)** Rehearse `add-chain` (v2.0.0, `--mode burning`, zero CCL) + `push` + one
  Executor and one manual transfer on a throwaway deployment on **Arbitrum Sepolia** (Orbit stack;
  Executor and shim exist on testnet) with the exact CLI/SDK versions from R-C0/R-C2. This validates
  tooling only; nothing Robinhood-specific.
- **R-O4 (Must)** Kill-switch written and timed on the rehearsal: (a) `paused: true` on the
  Robinhood manager; (b) `setInboundLimit(Robinhood, 0)` on Ethereum/Solana/Base/BSC (the actual
  containment: it stops minting from Robinhood-origin VAAs); (c) remove Robinhood from any UI.
  **Unpeering is not available.**

### Contracts (Phase 1)

- **R-C4 (Must)** Deploy the BIO ERC-20 on Robinhood: `mint` restricted to the NttManager, standard
  `burn(uint256)`, 18 decimals, `name`/`symbol` identical to Base/BSC BIO; assert on-chain
  `decimals()` before any peer is registered (peers store `tokenDecimals`).
- **R-C4a (Must)** Verification: deploy with `--skip-verify` (the CLI only supports
  `--etherscan-api-key`), then `forge verify-contract --verifier blockscout --verifier-url
  https://robinhoodchain.blockscout.com/api/` for the manager implementation and proxy, transceiver
  implementation and proxy, shim, and token.
- **R-C5 (Must)** `ntt add-chain Robinhood --token <addr> --mode burning --ver 2.0.0` from the
  R-C0 root, with `overrides.json` providing a dedicated RPC (Alchemy/other provider, hostname
  verified first), no `--yes`, no `--unsafe-custom-finality`; answer the inbound-limit prompts with
  the agreed launch values (Q-O1), never the uint64-max default.
- **R-C6 (Must)** Peering ceremony: fork-simulate (`anvil --fork-url`) every `setPeer` /
  `setWormholePeer` / `setInboundLimit` / `setOutboundLimit` against Ethereum, Base, BSC (and the
  Solana equivalents), diff resulting state, then execute via `ntt push` (EOA owner) or Safe
  transactions (Safe owner). Afterwards assert on each EVM chain: `getPeer(72)` correct,
  transceiver `getWormholePeer(72)` correct, `isWormholeRelayingEnabled(72) == false`,
  `isSpecialRelayingEnabled(72) == false`; lower Robinhood's outbound limit explicitly.
- **R-C7 (Must)** Ownership of Robinhood manager/transceiver/token/shim matches the existing
  model (owner = pauser = `0x9eC0…` today). Splitting pauser from owner is a separate follow-up
  across all chains, not a Robinhood-only change.
- **R-C8 (Should)** Deterministic deploy so Robinhood BIO equals `0x226A…7DD2`. If not achieved,
  plan the disambiguation (token lists, docs, UI warning) before any public exposure.
- **R-C9 (Must)** Commit updated `deployment.json`, all addresses and tx hashes, the CLI commit and
  exact invocations to the deployment repo; mirror addresses into `src/wormhole.config.ts`.
- **R-S1 (Must)** Owner keys used for peering are the production owners; confirm custody before
  the ceremony. No agent runs `ntt push` or any signing step.
- **R-S3 (Should)** Before pointing the transceiver at it, confirm the Core Bridge at `0x141f…` on
  Blockscout matches `.env.robinhoodchain.mainnet` (`chainId() == 72`, `evmChainId() == 4663`).
- **R-S4 (Must)** State in the ceremony plan that transceiver peer registration is one-shot and
  that the remedy for a wrong address is redeploying and re-registering transceivers on production
  chains. Two-person review of every peer address before signing.

### Relay (Phase 1–2)

- **R-R2 (Must)** Deploy `NttManagerWithExecutor` v0.0.2 on Robinhood
  (`constructor(72, 0xd19aAd5a…)`, CREATE2 salt from the repo script) or have Wormhole Labs do it;
  then open the `sdk-evm-ntt` PR adding it to `nttManagerWithExecutorAddresses.Mainnet`.
- **R-R3 (Should)** Decide the Executor referrer fee as a `getFee` callback returning fixed
  `transferTokenFee`/`nativeTokenFee` and a Bio payee (Phase 4 unless trivial).
- **R-R4 (Must)** Measure end-to-end latency and cost both ways on mainnet with small amounts;
  hardcode measured values in any UI copy and runbook; do not surface `estimateFinalityTime`. File
  the optimistic finality constant upstream alongside R-U5.
- **R-R5 (Must)** Determine whether chain 72 needs an `executorGasLimitOverrides` entry in
  `sdk-evm-ntt`; if so, it is a second upstream PR with a named owner. Until it lands expect quote
  failures or overpayment.
- **R-R6 (Must)** Configure an Executor `gasDropOff` on X→Robinhood sufficient for one outbound
  transfer at current Robinhood gas, or state in the UI that recipients must fund ETH separately.

### UI (Phase 3, gated)

- **R-U1 (Must)** Robinhood Chain selectable for BIO only, with icon (`sdk-icons` already has one),
  Blockscout explorer links, ETH gas symbol.
- **R-U2a (Must, Option B)** App prompts `wallet_addEthereumChain` for 4663 with RPC and explorer.
  **R-U2b (Must, Option A)** Confirm the upstream Connect chain entry carries the data its wallet
  layer needs to add the chain; if not, that is a second upstream PR.
- **R-U3 (Must)** RPC via `NEXT_PUBLIC_ROBINHOOD_RPC_URL` with a **domain-restricted** provider
  key (the static export publishes it) or a proxied endpoint; update `src/env.d.ts`; name the deploy
  target and the credential owner.
- **R-U4 (Must)** Executor when available, manual otherwise; the manual path guides redeem on the
  destination including destination gas.
- **R-U5 (Should)** Upstream, with a named owner and date each: `wormhole-connect` PR adding the
  `Robinhood` `MAINNET_CHAINS` entry (Connect must also bump its SDK past 6.1.5, which is their
  release, not ours); `native-token-transfers` CLI pin bump (R-C2); `sdk-evm-ntt` shim address
  (R-R2) and gas-limit override (R-R5) PRs.
- **R-U6 (Should)** Option B is BIO-only, feature-flagged, and deleted when Option A lands.
- **R-U7 (Must)** Register `nttManualRoute` alongside `nttExecutorRoute` in `wormhole.config.ts`
  and verify Connect's manual-redeem UX for a pair the Executor does not cover.
- **R-U8 (Should)** Submit the Robinhood BIO contract to CoinGecko platform mapping and to the
  Robinhood Wallet token list; until then expect no USD price display. Confirm whether Robinhood
  Wallet requires allowlisting to display an arbitrary ERC-20.

### Genome / ecosystem (separate PRs)

- **R-G1** Repoint `BIO_ECOSYSTEM_URLS.bridge` to this deployment and make the three footer copies
  import the catalog — **now**, independent of Robinhood.
- **R-G2** Add Robinhood Chain (4663) and the Robinhood BIO address to a chain-agnostic token
  registry (extend `packages/base-chain` or its successor), a `defineChain` in `org-wallets`, and
  extend `viemChainForId` in `use-linked-wallet-client.ts`, which throws for every id but Base.
- **R-G3** Add the bridge to `ABOUT_NETWORK_ITEMS` (About grid, `llms.txt`, homepage JSON-LD).
- **R-G4** Legal/comms review before any announcement; it must not imply Robinhood brokerage
  support for BIO.

### Ops (Phase 1, before first public transfer)

- **R-O1 (Must)** Runbook: pause/unpause (`paused: true` + push, or Safe call), raise/lower limits,
  release a queued inbound transfer, rotate RPC, fetch a chain-72 VAA from Wormholescan or a
  Guardian, execute the kill-switch (R-O4); note that `--signer-type ledger` does not work on EVM.
- **R-O2 (Should)** Self-hosted monitoring (Robinhood has no status page): Robinhood block
  production stalls and batch-posting lag; Executor quote failures for chain 72; inbound-queue
  entries for Robinhood-origin transfers on any chain; delegated-set liveness
  (`wormhole_delegated_guardian_set_signers{chain="RobinhoodChain"}` — if 3 of 7 delegates are
  offline, chain-72 VAAs stop); Robinhood's `notices-and-upgrades` page for ArbOS changes.
- **R-O3 (Must)** Record every deployed address and tx hash in the deployment repo README.

### Testing

- **R-T1 (Must)** There is no Wormhole testnet for Robinhood: the mainnet proof uses small amounts
  under tight limits. Matrix: Ethereum→Robinhood (Executor if R-R1 passes, else manual),
  Robinhood→Ethereum (Executor via the Bio-deployed shim, else manual), one Base/BSC pair,
  a rate-limit hit and queue release, pause/unpause, kill-switch (b) and its reversal.

### Security disclosures

- **R-S2 (Must)** User-facing docs state: BIO on Robinhood can only leave Robinhood by transacting
  on Robinhood — a sequencer halt delays exit and sequencer censorship (transaction filterer, no
  force-inclusion mechanism) prevents it, with no L1 fallback for NTT-minted tokens; Robinhood-origin
  VAAs are attested by a delegated set of 7 guardians with threshold 5 (not 13/19), set by governance
  and changeable without our involvement; Robinhood Chain is L2BEAT "Other" (permissioned proofs).

## 9. Delivery phases and sizing

| Phase | Work | Gate to exit | Size |
|---|---|---|---|
| 0. Gates | R-G0, R-C0, R-C1, R-C2, R-C3, R-R1, R-R7, R-S5, R-T2, R-O4; open upstream asks (R-U5 list) with owners | All Must gates green; Q-C3/Q-O1 answered | 3–5 days of work plus Wormhole response time |
| 1. Contracts + ops | R-C4…R-C9, R-R2, R-S1, R-S3, R-S4, R-O1, R-O3 | Peered, limits lowered, runbook and kill-switch in repo | 2–3 days (EOA owner) to 1–2 weeks (Safe ceremony across 4 chains) |
| 2. Proof | R-R4, R-R5, R-R6, R-T1 | Scripted round-trip documented with measured latency/cost; kill-switch rehearsed on mainnet | 1–2 days |
| 3. UI decision (dated gate) | If Connect has shipped Robinhood → Option A (1–2 days incl. Connect major upgrade, R-U7). Else if demand confirmed → Option B (8–12 days). Else keep the spoke peered but unexposed | — | as stated |
| 4. Ecosystem | R-G2, R-G3, R-G4, R-R3, R-U8 | — | 1–2 days |

R-G1 is a standalone genome PR now. The spike's critical path is Phase 0 → 1 → 2; the UI is not on it.

## 10. Risks

### Accepted (with revisit trigger)

- **Mainnet-only testing.** Mitigation: tight limits, Arbitrum Sepolia rehearsal (tooling only),
  small-amount proof. Revisit if Wormhole adds a Robinhood testnet.
- **Delegated 5-of-7 guardian trust for Robinhood-origin VAAs**, with no Governor/Accountant.
  Mitigation: inbound limits on the four existing managers are the cap; disclosed in R-S2. Revisit
  if Wormhole adds chain 72 to the Governor or offers Accountant enrolment (Q-R3).
- **Rate limits cap velocity, not cumulative exposure** (cancel-flows). Mitigation: low inbound
  limits, queue monitoring. Revisit after 30 days of observed volume.
- **Robinhood Chain operational maturity**: single sequencer, no status page, filterer, young
  chain, one reported disruption. Mitigation: self-hosted monitoring (R-O2), disclosure (R-S2).
- **Robinhood-side stranding**: an outbound transfer burned on Robinhood during a halt has no VAA
  until batches post and finalize; a censored user cannot exit. Mitigation: disclosure; exposure cap.
- **Vendored, tagless deployment repo.** Mitigation: R-C0. Revisit: move the deployment file into
  a repo that tracks upstream tags.
- **Executor pricing volatility / quote failure is a dead end in the UI.** Mitigation: manual
  route always registered (R-U7), gas-drop-off (R-R6), gas-limit override (R-R5).
- **Two SDK majors in one bundle if Option B ships.** Mitigation: route-level code split; delete
  on Option A.

### Open (must close before Phase 1)

- Executor capabilities for chain 72 (R-R1) — decides Executor vs manual-only.
- Wormholescan indexing of chain 72 (R-R7) — decides tracking and runbook shape.
- Owner custody: EOA vs Safe on `0x9eC0…` and the Solana authority (Q-C3) — decides ceremony size.
- BSC's mode/version and the Solana version (R-C1) — a locking BSC would change the model.
- Token address parity (Q-C2) — if not achievable, disambiguation plan required (R-C8).
- Wormhole's answer on v2 next to v1.1.0 (R-C3) — courtesy confirmation; code evidence says compatible.

## 11. Open questions

**Answered by verification (kept for the record)**

- *Is Safe deployed on Robinhood Chain?* Yes — canonical Safe v1.4.1 L2 on 4663 and 46630.
- *Does the Solana program need an upgrade for chain 72?* No — `ChainId` is an opaque `u16`.
- *Can a v2 EVM manager peer with v1.1.0 EVM managers?* Encoding is byte-identical; v2's optional
  payload encodes to the v1 layout when empty. Operational sign-off from Wormhole still requested.
- *Does `chainToPlatform` throw for Robinhood on SDK 6.1.4?* No, it returns `undefined`; the CLI
  is stopped earlier by the yargs `choices` list.
- *Does the Governor matter?* No — it never applies to NTT messages.
- *Which chains should the UI expose in the spike?* Decided in §6: none in the spike; Ethereum ↔
  Robinhood first at the Phase 3 gate.
- *Repoint the genome portalbridge links now or later?* Now, as its own PR (R-G1).

**Contracts**

- **Q-C1** What does `ntt pull` return for BSC (mode, version, owner, limits) and the Solana program
  version, and what else is drifted?
- **Q-C2** Who ran the Base/BSC BIO token deploy (CREATE2 salt or controlled nonce), and do we want
  address parity on Robinhood?
- **Q-C3** Is `0x9eC0B6aE…99b5` an EOA or a Safe? Who signs for it and for the Solana owner
  `man5NNs4…CcJ`? (Phase 0 gate.)
- **Q-C5** Does Wormhole recommend v2.0.0+evm for a new spoke next to v1.1.0 managers, and does
  anyone run that pair in production? (Courtesy confirmation; not a spike blocker.)
- **Q-C6** Does Blockscout verification for Robinhood require an API key, and who holds it?

**Relay**

- **Q-R1** Referrer fee (`getFee` callback) and payee, if any.
- **Q-R2** Executor capabilities and Wormholescan indexing for chain 72 (R-R1, R-R7).
- **Q-R3** Will Wormhole add chain 72 to the Governor and/or enrol this deployment in the NTT
  Accountant? Absent both, NTT limits are the only cap.
- **Q-R4** Does chain 72 need an `executorGasLimitOverrides` entry, and who lands it?
- **Q-R5** Is Wormhole Queries (CCQ) supported for chain 72? (Not needed for the spike.)

**Product / ops**

- **Q-O1** Launch rate limits (Robinhood outbound; Robinhood inbound on each existing chain, well
  below 66.4 M) and who approves changes.
- **Q-O3** Who are "our users" on Robinhood Chain — Robinhood Wallet users, or users bridging out
  to Robinhood Chain DEXs — and is there evidence of demand? (Go/no-go, R-G0.)
- **Q-O5** Does Robinhood Wallet require token allowlisting to display BIO?
- **Q-O6** Who owns each upstream PR (Connect chain entry, CLI pin bump, `sdk-evm-ntt` shim address
  and gas override, finality constant), and by when?

**Unverified facts to close out**

- Executor capabilities for chain 72; Wormholescan indexing of chain 72.
- Alchemy's Robinhood **mainnet** RPC hostname; any free official JSON-RPC WSS.
- Owner address type (EOA vs Safe) on Ethereum/Base/BSC.
- Verified source of the Base/BSC BIO token contract.
- Whether Wormhole's "Supported Networks" page lists Robinhood NTT as GA.
- Robinhood brokerage transfer list (point-in-time; re-check before any user-facing claim).

## 12. Success criteria, time-box, abandon rule

- **Success:** one scripted round-trip Ethereum ↔ Robinhood completed on mainnet with measured
  latency and cost each way; kill-switch (pause + inbound limit 0) executed and reversed on mainnet;
  runbook and all addresses/invocations committed to the deployment repo; R-S2 disclosure text
  approved.
- **Time-box:** four weeks from Phase 0 start to the Phase 3 gate.
- **Abandon / pause rule:** if R-G0 finds no demand, stop before Phase 1. If Wormhole has not
  answered R-C3 and R-R1 within two weeks, keep the spoke un-peered and re-plan. If R-R1 shows no
  Executor coverage and R-R7 shows no Wormholescan indexing, the spike is manual-only with
  Guardian-fetched VAAs — decide explicitly whether that is worth shipping.

## 13. Revision 2 change log (what the verification passes changed)

- **Corrected**: v1.1.0 does **not** require relayer addresses (rationale for v2 rewritten);
  `chainToPlatform` does not throw (yargs `choices` gate is the blocker); the `NttManagerWithExecutor`
  shim is permissionless (R-R2 rewritten); referrer fees are fixed amounts on shim v0.0.2, not
  `dbps`; `setIsWormholeEvmChain` removed from the ceremony; Plume precedent inverted; $PONS is not a
  Robinhood-side NTT deployment; "Queries ✅" removed; exit window is ≈6.4 + 2 days; the 2026-09-04
  outage is disputed; the SDK finality estimate for Robinhood is ~2.5× optimistic.
- **Added**: delegated guardian set 7-of-5 for chain 72 and its consequences (R-S2, R-S5, R-O2,
  rate-limit rationale); one-shot transceiver peering and fork simulation (R-S4, R-C6); kill-switch
  (R-O4); tagless deployment repo and runnable NTT root (R-C0); `ntt pull` cannot add BSC (R-C1);
  vendored CLI enabling standard relaying; Governor irrelevance and no Accountant; Safe on Robinhood
  (closes Q-C4); Blockscout verification is manual (R-C4a); metadata parity (R-C4); gas drop-off and
  gas-limit override (R-R5, R-R6); Wormholescan dependency (R-R7); manual route registration (R-U7);
  `viemChainForId` and homepage JSON-LD touchpoints (R-G2, R-G3); legal/comms review (R-G4);
  time-box and abandon rule (§12).
- **Reframed**: the spike is contract-only with the UI at a dated gate; Option A is the end-state,
  not the plan; Option B re-sized to 8–12 days; R-T2 and ops runbook promoted to Must and moved before
  Phase 1; Q-O3 promoted to the go/no-go gate.
