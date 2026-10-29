export const securityOptions = [
  { value: "wpa2-personal", label: "WPA2-Personal" },
  { value: "wpa3-personal", label: "WPA3-Personal" },
  { value: "open", label: "암호 없음 (OPEN)" },
] as const;
export type Security = (typeof securityOptions)[number]["value"];
export type Network = {
  id: string;
  name: string;
  ssid: string;
  security: Security;
  enabled: boolean;
  hasPassword: boolean;
  revision: number;
  updatedAt: string;
  apCount: number;
};
export type AccessPoint = {
  id: string;
  networkId: string;
  name: string;
  bssid: string;
  building: string;
  floor: string;
  place: string;
  enabled: boolean;
  effectiveEnabled: boolean;
  locationRegistered: boolean;
  revision: number;
  updatedAt: string;
};
export type SchoolSnapshot = { version: number; networks: Network[]; accessPoints: AccessPoint[] };
