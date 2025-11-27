import WormholeConnect, {
  WormholeConnectTheme,
} from "@wormhole-foundation/wormhole-connect";
import { wormholeConfig } from "./wormhole.config";
import "./App.css";

function App() {
  const theme: WormholeConnectTheme = {
    mode: "dark",
    background: "transparent",
    formBackground: "rgba(10, 15, 20, 0.85)",
    formBorder: "rgba(141, 255, 51, 0.2)",
    primary: "#8DFF33",
    secondary: "#7AE029",
    text: "#FFFFFF",
    textSecondary: "rgba(255, 255, 255, 0.7)",
    font: "'Inter', sans-serif",
  };

  return (
    <div className="app-container">
      {/* Header with BIO Logo */}
      <header className="app-header">
        <img
          src="https://docs.bio.xyz/bio/~gitbook/image?url=https%3A%2F%2F499247139-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F3ba2jNU6BPQUl4RXgHor%252Fuploads%252FtWMezh7l9roY58XtlzAh%252FBIO%2520Icon%2520Light%2520Green.png%3Falt%3Dmedia%26token%3Dff7290b9-8dbf-49a9-bc2a-14d0a618018e&width=768&dpr=4&quality=100&sign=7efa5afb&sv=2"
          alt="BIO"
          className="bio-logo"
        />
        <h1 className="app-title">Bio Ecosystem Bridge</h1>
        <p className="app-subtitle">Transfer BIO tokens across chains</p>
      </header>

      {/* Wormhole Connect Widget */}
      <main className="widget-container">
        <WormholeConnect config={wormholeConfig} theme={theme} />
      </main>
    </div>
  );
}
export default App;
