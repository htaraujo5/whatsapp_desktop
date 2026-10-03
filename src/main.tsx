import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import Toasts from "./Toasts";
import "./styles/index.css";

const isToast = getCurrentWindow().label === "toast";
if (isToast) document.documentElement.classList.add("toast");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isToast ? <Toasts /> : <App />}</StrictMode>,
);
