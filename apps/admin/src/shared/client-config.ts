import type { Security } from "./school";

// Credential-bearing transport DTO. Never use as a management DTO or log its body.
export type ClientSchoolConfig = {
  schemaVersion: 1;
  version: number;
  networks: { id: string; ssid: string; security: Security; password: string | null }[];
  accessPoints: { id: string; networkId: string; bssid: string }[];
};
