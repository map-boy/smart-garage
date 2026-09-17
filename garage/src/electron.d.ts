export {};

declare global {
  interface Window {
    /** Present only when running inside the Electron shell. */
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      checkForUpdate: () => Promise<unknown>;
      notify: (title: string, body: string) => void;
      setBadge: (count: number) => void;
      platform: string;
    };
  }
}