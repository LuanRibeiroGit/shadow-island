import { installErrorReporter } from "../bridge/errors";
import { createRoot } from "react-dom/client";
import "../styles/theme.css";
import { App } from "./App";

installErrorReporter();
createRoot(document.getElementById("root")!).render(<App />);
