import WormholeConnect, {
  WormholeConnectTheme,
} from "@wormhole-foundation/wormhole-connect";
import { wormholeConfig } from "./wormhole.config";

function App() {
  const theme: WormholeConnectTheme = {
    mode: "dark",
  };

  return (
    <div>
      <WormholeConnect config={wormholeConfig} theme={theme} />
    </div>
  );
}
export default App;
