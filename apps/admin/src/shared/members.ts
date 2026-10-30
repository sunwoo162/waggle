export type MemberDevice = {
  id: string;
  platform: "android" | "windows";
  name: string;
  createdAt: number;
  refreshedAt: number;
  expiresAt: number;
  status: "active" | "revoked" | "expired";
};
export type InviteMember = {
  id: string;
  alias: string;
  revision: number;
  codeActive: boolean;
  createdAt: number;
  issuedAt: number;
  devices: MemberDevice[];
};
export type MemberSnapshot = { members: InviteMember[] };
export type IssuedInvite = { member: InviteMember; code: string };
export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessExpiresIn: number;
  refreshExpiresAt: number;
};
