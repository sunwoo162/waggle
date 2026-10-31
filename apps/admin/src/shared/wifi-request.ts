import type { Security } from "./school";

/** A pending student Wi-Fi registration request as shown to the operator. Never includes the password. */
export type WifiRequestItem = {
  id: string;
  room: string;
  ssid: string;
  security: Security;
  createdAt: string;
};
