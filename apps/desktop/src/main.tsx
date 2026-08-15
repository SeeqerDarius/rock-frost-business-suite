import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import "@/styles/theme.css";

const rootContainer = document.getElementById("root");
if (!rootContainer) throw new Error("Root element #root not found in index.html.");
const container: HTMLElement = rootContainer;

function showFatalStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : "An unexpected startup error occurred.";
  container.dataset.appReady = "false";
  container.innerHTML = `
    <main style="display:grid;min-height:100vh;place-items:center;padding:32px;font-family:Segoe UI,sans-serif;background:#f8fafc;color:#0f172a">
      <section style="max-width:560px;border:1px solid #cbd5e1;border-radius:16px;background:white;padding:28px">
        <h1 style="margin:0 0 12px;font-size:24px">Rock Frost could not start</h1>
        <p style="line-height:1.6;color:#475569">${message.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character)}</p>
        <p style="line-height:1.6;color:#475569">Close the application and contact Rock Frost support with this message.</p>
      </section>
    </main>`;
}

const root = createRoot(container, {
  onUncaughtError: showFatalStartupError,
  onRecoverableError: showFatalStartupError,
});

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

window.requestAnimationFrame(() => {
  if (container.childElementCount > 0 && !container.querySelector("#startup-status")) {
    container.dataset.appReady = "true";
  }
});
