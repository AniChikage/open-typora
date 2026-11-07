import "./migrateStorage.ts";
import ReactDOM from "react-dom/client";
import App from "./App";
import { host } from './host';
import { initialLocale, setSystemLocale } from './initialLocale';
import { setLanguage } from './i18n';
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-700.css";
import "@fontsource/open-sans/latin-400-italic.css";
import "@fontsource/open-sans/latin-700-italic.css";
import "./styles.css";
import "./features.css";
import "./extensions.css";
import "./writingWorkspace.css";
try { setSystemLocale(await host.systemLocale()); } catch { /* Browser locale remains a safe fallback. */ }
setLanguage(initialLocale());
document.documentElement.lang = initialLocale();
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
