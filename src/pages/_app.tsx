// src/pages/_app.tsx
import type { AppProps } from "next/app";

// ← グローバルCSSは“必ず”ここで読み込む（相対パスに注意！）
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }: AppProps) {
    return <Component {...pageProps} />;
}
