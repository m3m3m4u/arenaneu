// Minimal Node globals to keep TS happy in server files without pulling full @types/node
declare const process: { env: Record<string, string | undefined> };
declare const Buffer: {
  from(data: ArrayBuffer | string): { toString(encoding: 'base64'): string } & Uint8Array;
};
