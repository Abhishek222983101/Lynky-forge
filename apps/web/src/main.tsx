import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Pure mount entry. Keeping this free of component code and side effects means
// editing App.tsx hot-reloads in place instead of triggering a full page reload.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
