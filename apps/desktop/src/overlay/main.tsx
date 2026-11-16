import { createRoot } from "react-dom/client";
import "../styles/theme.css";
import { OverlayApp } from "./OverlayApp";

createRoot(document.getElementById("root")!).render(<OverlayApp />);
