import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { startSyncLoop } from "./sync";

startSyncLoop(15000);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);