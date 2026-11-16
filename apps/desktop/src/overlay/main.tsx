import { installErrorReporter } from "../bridge/errors";
import { createRoot } from "react-dom/client";
import "../styles/theme.css";
import { OverlayApp } from "./OverlayApp";

installErrorReporter();
createRoot(document.getElementById("root")!).render(<OverlayApp />);
