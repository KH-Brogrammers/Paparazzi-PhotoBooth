import 'vite/client';

declare global {
  interface ImportMetaEnv {
    readonly VITE_PUBLIC_BACKEND_URL: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
