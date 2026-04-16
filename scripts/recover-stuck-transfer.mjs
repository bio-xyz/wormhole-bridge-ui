#!/usr/bin/env node
/**
 * Recovery toolkit for stuck Wormhole Standard Relay NTT transfers.
 *
 * The Standard Relay service shut down April 1, 2026, but the on-chain
 * relayer contracts still work. This script calls deliver() on the
 * destination chain's Standard Relayer contract to complete any stuck
 * transfer where the VAA was signed but never delivered.
 *
 * Usage:
 *   # Look up a transaction (read-only, no wallet needed)
 *   node scripts/recover-stuck-transfer.mjs info <source-tx-hash>
 *
 *   # Dry run (estimates gas, no transaction submitted)
 *   node scripts/recover-stuck-transfer.mjs deliver <source-tx-hash> --dry-run
 *
 *   # Execute delivery
 *   node scripts/recover-stuck-transfer.mjs deliver <source-tx-hash>
 *
 * Environment (.env or exported):
 *   PRIVATE_KEY                   - Wallet private key (needs native gas token on dest chain)
 *   NEXT_PUBLIC_ETHEREUM_RPC_URL  - Ethereum RPC
 *   NEXT_PUBLIC_BSC_RPC_URL       - BSC RPC
 *   NEXT_PUBLIC_BASE_RPC_URL      - Base RPC
 *   NEXT_PUBLIC_SOLANA_RPC_URL    - Solana RPC (info only — delivery not supported)
 *
 * Supports any EVM destination chain in the Wormhole ecosystem.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
  formatGwei,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, bsc, base, arbitrum, optimism, polygon, avalanche } from "viem/chains";
import { readFileSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// .env loader (no dotenv dependency)
// ---------------------------------------------------------------------------
try {
  const envPath = resolve(process.cwd(), ".env");
  const envFile = readFileSync(envPath, "utf8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // No .env — env vars must be set directly
}

// ---------------------------------------------------------------------------
// Wormhole chain ID → chain config
// ---------------------------------------------------------------------------
const WORMHOLE_CHAINS = {
  1:  { name: "Solana",    evm: false },
  2:  { name: "Ethereum",  evm: true, viemChain: mainnet,    explorerTx: "https://etherscan.io/tx",         explorerAddr: "https://etherscan.io/address",         rpcKeys: ["ETHEREUM_RPC_URL", "NEXT_PUBLIC_ETHEREUM_RPC_URL"] },
  4:  { name: "BSC",       evm: true, viemChain: bsc,        explorerTx: "https://bscscan.com/tx",          explorerAddr: "https://bscscan.com/address",          rpcKeys: ["BSC_RPC_URL", "NEXT_PUBLIC_BSC_RPC_URL"] },
  5:  { name: "Polygon",   evm: true, viemChain: polygon,    explorerTx: "https://polygonscan.com/tx",      explorerAddr: "https://polygonscan.com/address",      rpcKeys: ["POLYGON_RPC_URL", "NEXT_PUBLIC_POLYGON_RPC_URL"] },
  6:  { name: "Avalanche", evm: true, viemChain: avalanche,  explorerTx: "https://snowtrace.io/tx",         explorerAddr: "https://snowtrace.io/address",         rpcKeys: ["AVALANCHE_RPC_URL", "NEXT_PUBLIC_AVALANCHE_RPC_URL"] },
  10: { name: "Fantom",    evm: true, viemChain: defineChain({ id: 250, name: "Fantom", nativeCurrency: { name: "FTM", symbol: "FTM", decimals: 18 }, rpcUrls: { default: { http: [] } } }), explorerTx: "https://ftmscan.com/tx", explorerAddr: "https://ftmscan.com/address", rpcKeys: ["FANTOM_RPC_URL"] },
  23: { name: "Arbitrum",  evm: true, viemChain: arbitrum,   explorerTx: "https://arbiscan.io/tx",          explorerAddr: "https://arbiscan.io/address",          rpcKeys: ["ARBITRUM_RPC_URL", "NEXT_PUBLIC_ARBITRUM_RPC_URL"] },
  24: { name: "Optimism",  evm: true, viemChain: optimism,   explorerTx: "https://optimistic.etherscan.io/tx", explorerAddr: "https://optimistic.etherscan.io/address", rpcKeys: ["OPTIMISM_RPC_URL", "NEXT_PUBLIC_OPTIMISM_RPC_URL"] },
  30: { name: "Base",      evm: true, viemChain: base,       explorerTx: "https://basescan.org/tx",         explorerAddr: "https://basescan.org/address",         rpcKeys: ["BASE_RPC_URL", "NEXT_PUBLIC_BASE_RPC_URL"] },
};

// Standard Relayer — same deterministic address on all EVM chains
const STANDARD_RELAYER = "0x27428DD2d3DD32A4D7f7C497eAaa23130d894911";

const relayerAbi = parseAbi([
  "function deliver(bytes[] encodedVMs, bytes encodedDeliveryVAA, address relayerRefundAddress, bytes deliveryOverrides) payable",
]);

// ---------------------------------------------------------------------------
// Wormholescan API helpers
// ---------------------------------------------------------------------------
async function fetchOperation(txHash) {
  const url = `https://api.wormholescan.io/api/v1/operations?txHash=${txHash}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wormholescan API returned ${res.status}`);
  const json = await res.json();
  const ops = json.operations;
  if (!ops || ops.length === 0) {
    throw new Error("No Wormhole operations found for this transaction hash");
  }
  return ops[0];
}

async function fetchVAA(chainId, emitter, sequence) {
  const url = `https://api.wormholescan.io/api/v1/vaas/${chainId}/${emitter}/${sequence}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wormholescan VAA API returned ${res.status}`);
  const json = await res.json();
  const vaaBase64 = json.data?.vaa;
  if (!vaaBase64 || typeof vaaBase64 !== "string") {
    throw new Error("VAA not found — may have been purged from guardian network");
  }
  return `0x${Buffer.from(vaaBase64, "base64").toString("hex")}`;
}

function getRpcUrl(chainConfig) {
  for (const key of chainConfig.rpcKeys) {
    if (process.env[key]) return process.env[key];
  }
  return null;
}

function chainName(whChainId) {
  return WORMHOLE_CHAINS[whChainId]?.name || `Chain ${whChainId}`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
async function cmdInfo(txHash) {
  console.log("=== Wormhole Transfer Lookup ===\n");
  console.log(`Source TX: ${txHash}\n`);
  console.log("Fetching from Wormholescan...\n");

  const op = await fetchOperation(txHash);
  const props = op.content?.standarizedProperties || {};
  const payload = op.content?.payload || {};
  const ntt = payload.parsedPayload || {};
  const srcChain = WORMHOLE_CHAINS[props.fromChain];
  const dstChain = WORMHOLE_CHAINS[props.toChain];

  console.log("--- Transfer Details ---");
  console.log(`Source:        ${chainName(props.fromChain)} (Wormhole chain ${props.fromChain})`);
  console.log(`Destination:   ${chainName(props.toChain)} (Wormhole chain ${props.toChain})`);
  console.log(`From:          ${props.fromAddress}`);
  console.log(`To:            ${props.toAddress}`);
  console.log(`Token:         ${op.data?.symbol?.toUpperCase() || "unknown"}`);
  console.log(`Amount:        ${op.data?.tokenAmount || "unknown"}`);
  console.log(`USD Value:     $${op.data?.usdAmount ? Number(op.data.usdAmount).toFixed(2) : "unknown"}`);
  console.log(`Timestamp:     ${op.sourceChain?.timestamp}`);

  console.log("\n--- VAA Status ---");
  console.log(`Emitter:       ${op.emitterAddress?.native}`);
  console.log(`Sequence:      ${op.sequence}`);
  console.log(`VAA Signed:    ${op.vaa ? "Yes" : "No"}`);

  const hasDestTx = !!op.targetChain?.transaction;
  console.log(`Delivered:     ${hasDestTx ? "Yes" : "NO — stuck"}`);

  if (hasDestTx) {
    console.log(`Dest TX:       ${op.targetChain.transaction.txHash}`);
  }

  console.log("\n--- App Info ---");
  const apps = props.appIds || [];
  console.log(`App Types:     ${apps.join(", ") || "unknown"}`);
  if (apps.includes("GENERIC_RELAYER")) {
    console.log(`Relay Type:    Standard Relay (Generic Relayer)`);
  }

  if (ntt.transceiverMessage) {
    console.log(`NTT Source Mgr:  ${ntt.transceiverMessage.sourceNttManager}`);
    console.log(`NTT Dest Mgr:    ${ntt.transceiverMessage.recipientNttManager}`);
  }

  if (!hasDestTx) {
    console.log("\n--- Recovery ---");
    if (!dstChain) {
      console.log(`Destination chain ${props.toChain} not recognized.`);
    } else if (!dstChain.evm) {
      console.log(`Destination is ${dstChain.name} (non-EVM) — manual SDK redemption required.`);
      console.log("This script only supports EVM destination chains.");
    } else {
      console.log("This transfer can be recovered with:");
      console.log(`  node scripts/recover-stuck-transfer.mjs deliver ${txHash} --dry-run`);
    }
  }
}

async function cmdDeliver(txHash, dryRun) {
  console.log("=== Wormhole Stuck Transfer Recovery ===\n");
  console.log(`Source TX: ${txHash}`);
  console.log(`Mode:      ${dryRun ? "DRY RUN" : "LIVE"}\n`);

  // 1. Look up the operation
  console.log("Looking up transfer on Wormholescan...");
  const op = await fetchOperation(txHash);
  const props = op.content?.standarizedProperties || {};
  const ntt = op.content?.payload?.parsedPayload || {};

  const srcChainId = props.fromChain;
  const dstChainId = props.toChain;
  const dstChain = WORMHOLE_CHAINS[dstChainId];
  const recipient = props.toAddress;
  const symbol = op.data?.symbol?.toUpperCase() || "TOKEN";
  const amount = op.data?.tokenAmount || "unknown";

  console.log(`Transfer:  ${chainName(srcChainId)} -> ${chainName(dstChainId)}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Amount:    ${amount} ${symbol}`);
  console.log(`VAA:       chain=${srcChainId} seq=${op.sequence}\n`);

  // Validate destination
  if (!dstChain) {
    console.error(`Error: Destination chain ${dstChainId} not recognized`);
    process.exit(1);
  }
  if (!dstChain.evm) {
    console.error(`Error: Destination is ${dstChain.name} (non-EVM) — this script only supports EVM chains.`);
    console.error("Use the Wormhole TypeScript SDK for Solana redemption.");
    process.exit(1);
  }

  // Check if already delivered
  if (op.targetChain?.transaction) {
    console.log("This transfer has ALREADY been delivered!");
    console.log(`Dest TX: ${dstChain.explorerTx}/${op.targetChain.transaction.txHash}`);
    console.log(`\nCheck recipient: ${dstChain.explorerAddr}/${recipient}`);
    process.exit(0);
  }

  // 2. Fetch the signed VAA
  console.log("Fetching signed VAA...");
  const emitter = op.emitterAddress?.hex;
  if (!emitter) throw new Error("Could not extract emitter address from operation");
  const vaaBytes = await fetchVAA(srcChainId, emitter, op.sequence);
  const byteLen = (vaaBytes.length - 2) / 2;
  console.log(`VAA fetched: ${byteLen} bytes\n`);

  // 3. Connect to destination chain
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: PRIVATE_KEY env var required (wallet with native gas token)\n");
    console.error(`The wallet needs ${dstChain.name} gas to submit the delivery.`);
    process.exit(1);
  }

  const rpcUrl = getRpcUrl(dstChain);
  if (!rpcUrl) {
    console.error(`Error: No RPC URL found for ${dstChain.name}`);
    console.error(`Set one of: ${dstChain.rpcKeys.join(", ")}`);
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: dstChain.viemChain,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: dstChain.viemChain,
    transport: http(rpcUrl),
  });

  const chainId = await publicClient.getChainId();
  if (BigInt(chainId) !== BigInt(dstChain.viemChain.id)) {
    console.error(`Error: RPC returned chain ${chainId}, expected ${dstChain.viemChain.id} (${dstChain.name})`);
    process.exit(1);
  }

  console.log(`Connected to ${dstChain.name} as ${account.address}`);
  const balance = await publicClient.getBalance({ address: account.address });
  const nativeName = dstChain.viemChain.nativeCurrency?.symbol || "ETH";
  console.log(`Wallet balance: ${formatEther(balance)} ${nativeName}\n`);

  if (balance === 0n) {
    console.error(`Error: Wallet has no ${nativeName} — need gas`);
    process.exit(1);
  }

  // 4. Estimate gas
  console.log("Estimating gas for deliver()...");

  const callParams = {
    address: STANDARD_RELAYER,
    abi: relayerAbi,
    functionName: "deliver",
    args: [
      [],              // encodedVMs — empty (NTT payload embedded in delivery VAA)
      vaaBytes,        // encodedDeliveryVAA
      account.address, // relayerRefundAddress
      "0x",            // deliveryOverrides — none
    ],
    value: 0n,
    account,
  };

  let gasEstimate;
  let msgValue = 0n;

  try {
    gasEstimate = await publicClient.estimateContractGas(callParams);
  } catch (err) {
    const reason = err.shortMessage || err.message || String(err);

    if (/already.?delivered/i.test(reason) || /AlreadyDelivered/i.test(reason)) {
      console.log("\nThis VAA has ALREADY been delivered!");
      console.log(`Check: ${dstChain.explorerAddr}/${recipient}`);
      process.exit(0);
    }

    if (/insufficient|budget/i.test(reason)) {
      console.log("Relayer requires msg.value for delivery budget, retrying with 0.03...");
      msgValue = 30000000000000000n; // 0.03
      callParams.value = msgValue;
      try {
        gasEstimate = await publicClient.estimateContractGas(callParams);
      } catch (retryErr) {
        console.error("\nDelivery estimation failed even with msg.value:");
        console.error(`  ${retryErr.shortMessage || retryErr.message}`);
        console.error("\nThe relayer contract may be paused or the VAA invalid.");
        console.error("Consider contacting the Wormhole team on Discord.");
        process.exit(1);
      }
    } else {
      console.error(`\nGas estimation failed: ${reason}`);
      console.error("\nPossible causes:");
      console.error("  - Relayer contract paused");
      console.error("  - VAA already redeemed");
      console.error("  - NTT Manager rate-limiting the transfer");
      process.exit(1);
    }
  }

  const gasPrice = await publicClient.getGasPrice();
  const estimatedCost = gasEstimate * gasPrice;

  console.log(`\nGas estimate:    ${gasEstimate.toString()} gas`);
  console.log(`Gas price:       ${formatGwei(gasPrice)} gwei`);
  console.log(`Estimated cost:  ~${formatEther(estimatedCost)} ${nativeName}`);
  if (msgValue > 0n) {
    console.log(`msg.value:       ${formatEther(msgValue)} ${nativeName} (delivery budget)`);
    console.log(`Total max cost:  ~${formatEther(estimatedCost + msgValue)} ${nativeName}`);
  }

  if (dryRun) {
    console.log("\n--- DRY RUN COMPLETE ---");
    console.log("Gas estimation succeeded — delivery should work.");
    console.log(`Run: node scripts/recover-stuck-transfer.mjs deliver ${txHash}`);
    return;
  }

  // 5. Execute delivery
  console.log("\nSubmitting delivery transaction...");

  const hash = await walletClient.writeContract({
    ...callParams,
    gas: (gasEstimate * 130n) / 100n, // 30% buffer
  });

  console.log(`Transaction: ${dstChain.explorerTx}/${hash}`);
  console.log("Waiting for confirmation...\n");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "success") {
    console.log("=== DELIVERY SUCCESSFUL ===");
    console.log(`Block:     ${receipt.blockNumber}`);
    console.log(`Gas used:  ${receipt.gasUsed.toString()}`);
    console.log(`Cost:      ${formatEther(receipt.gasUsed * receipt.effectiveGasPrice)} ${nativeName}`);
    console.log(`\n${amount} ${symbol} should now be in:`);
    console.log(`  ${recipient}`);
    console.log(`\nVerify: ${dstChain.explorerAddr}/${recipient}`);
  } else {
    console.error("=== DELIVERY FAILED ===");
    console.error("Transaction reverted. Check explorer for details:");
    console.error(`  ${dstChain.explorerTx}/${hash}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function usage() {
  console.log(`Usage:
  node scripts/recover-stuck-transfer.mjs info    <source-tx-hash>              Look up transfer status
  node scripts/recover-stuck-transfer.mjs deliver <source-tx-hash> [--dry-run]  Deliver stuck transfer

Environment (.env):
  PRIVATE_KEY                   Wallet private key (deliver only)
  NEXT_PUBLIC_ETHEREUM_RPC_URL  Ethereum RPC
  NEXT_PUBLIC_BSC_RPC_URL       BSC RPC
  NEXT_PUBLIC_BASE_RPC_URL      Base RPC

Examples:
  node scripts/recover-stuck-transfer.mjs info 0x13dfe39a...
  node scripts/recover-stuck-transfer.mjs deliver 0x13dfe39a... --dry-run
  node scripts/recover-stuck-transfer.mjs deliver 0x13dfe39a...`);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
  const command = args[0];
  const txHash = args[1];

  if (!command || !txHash) {
    usage();
    process.exit(1);
  }

  // Normalize tx hash
  const normalizedHash = txHash.startsWith("0x") ? txHash : `0x${txHash}`;

  switch (command) {
    case "info":
      await cmdInfo(normalizedHash);
      break;
    case "deliver":
      await cmdDeliver(normalizedHash, flags.includes("--dry-run"));
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
