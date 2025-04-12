import WormholeConnect, {
  WormholeConnectConfig,
  nttRoutes,
  WormholeConnectTheme,
} from "@wormhole-foundation/wormhole-connect";

const wormholeConfig: WormholeConnectConfig = {
  network: "Mainnet",
  chains: ["Ethereum", "Solana", "Base"],
  rpcs: {
    Ethereum: import.meta.env.VITE_PUBLIC_ETHEREUM_RPC_URL,
    Solana: import.meta.env.VITE_PUBLIC_SOLANA_RPC_URL,
    Base: import.meta.env.VITE_PUBLIC_BASE_RPC_URL,
  },
  ui: {
    title: "",
    defaultInputs: {
      fromChain: "Solana",
      toChain: "Ethereum",
    },
    walletConnectProjectId: import.meta.env
      .VITE_PUBLIC_WALLET_CONNECT_PROJECT_ID,
  },
  tokens: ["BIO"],
  routes: [
    ...nttRoutes({
      tokens: {
        BIO_NTT: [
          {
            chain: "Ethereum",
            manager: "0x1783E7d1F498321D7E15044d769621E1beDc7F4C",
            token: "0xcb1592591996765Ec0eFc1f92599A19767ee5ffA",
            transceiver: [
              {
                address: "0x676Cd89c6B6f02d6975547fD7Da1d5A8dbc8a3E1",
                type: "wormhole",
              },
            ],
          },
          {
            chain: "Solana",
            manager: "ntt11hdA4n1PupHhLyT1fsjg4YF9agVz3CTuzLRQs1H",
            token: "bioJ9JTqW62MLz7UKHU69gtKhPpGi1BQhccj2kmSvUJ",
            transceiver: [
              {
                address: "5Yaf3N7MAEThp5FBBjUri8rv9mWxFEiJBjTKYYeKEi37",
                type: "wormhole",
              },
            ],
          },
          {
            chain: "Base",
            manager: "0x9AfEbcA0d37661167AFD24481C39eBE2Ead89571",
            token: "0x226A2FA2556C48245E57cd1cbA4C6c9e67077DD2",
            transceiver: [
              {
                address: "0xcb75cC365abD9713b9A9B9613d90e9C359dd483F",
                type: "wormhole",
              },
            ],
          },
        ],
      },
    }),
  ],
  tokensConfig: {
    BIOeth: {
      symbol: "BIO",
      tokenId: {
        chain: "Ethereum",
        address: "0xcb1592591996765Ec0eFc1f92599A19767ee5ffA",
      },
      icon: "https://499247139-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F3ba2jNU6BPQUl4RXgHor%2Fuploads%2FnVRhDT0Cg1c1FtdQQOMd%2FToken%20Symbol%20BIO%20Round.svg?alt=media&token=58f7ce22-da87-4a8f-80eb-5a4df20659f6",
      decimals: 18,
    },
    BIOsol: {
      symbol: "BIO",
      tokenId: {
        chain: "Solana",
        address: "bioJ9JTqW62MLz7UKHU69gtKhPpGi1BQhccj2kmSvUJ",
      },
      icon: "https://499247139-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F3ba2jNU6BPQUl4RXgHor%2Fuploads%2FnVRhDT0Cg1c1FtdQQOMd%2FToken%20Symbol%20BIO%20Round.svg?alt=media&token=58f7ce22-da87-4a8f-80eb-5a4df20659f6",
      decimals: 9,
    },
    BIObase: {
      symbol: "BIO",
      tokenId: {
        chain: "Base",
        address: "0x226A2FA2556C48245E57cd1cbA4C6c9e67077DD2",
      },
      icon: "https://499247139-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F3ba2jNU6BPQUl4RXgHor%2Fuploads%2FnVRhDT0Cg1c1FtdQQOMd%2FToken%20Symbol%20BIO%20Round.svg?alt=media&token=58f7ce22-da87-4a8f-80eb-5a4df20659f6",
      decimals: 18,
    },
  },
};

function App() {
  const theme: WormholeConnectTheme = {
    mode: "dark",
    primary: "#78c4b6",
  };

  return (
    <div>
      <WormholeConnect config={wormholeConfig} theme={theme} />
    </div>
  );
}
export default App;
