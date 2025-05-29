/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ETHEREUM_RPC_URL: string;
  readonly VITE_PUBLIC_SOLANA_RPC_URL: string;
  readonly VITE_PUBLIC_BASE_RPC_URL: string;
  readonly VITE_PUBLIC_WALLET_CONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
