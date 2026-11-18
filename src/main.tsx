import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { finishBattleNetRedirect } from "./lib/battlenet";
import "./styles.css";
import "./retro.css";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>The war room needs a reload.</h1>
        <p>Your guild data is still in the repository. Reload to reconnect.</p>
        <button onClick={() => location.reload()}>Reload app</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root = ReactDOM.createRoot(document.getElementById("root")!);
const openGuild = () =>
  root.render(
    <React.StrictMode>
      <Boundary>
        <App />
      </Boundary>
    </React.StrictMode>,
  );
if (window.location.hash.startsWith("#bnet-return=")) {
  root.render(
    <main className="loading-screen">
      <p>Finishing Battle.net sign-in…</p>
    </main>,
  );
  void finishBattleNetRedirect(
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "",
  )
    .then(openGuild)
    .catch((error: Error) => {
      root.render(
        <main className="loading-screen">
          <h1>Sign-in interrupted</h1>
          <p role="alert">{error.message}</p>
          <button className="btn primary" onClick={openGuild}>
            Return to Ønslaught
          </button>
        </main>,
      );
    });
} else openGuild();
