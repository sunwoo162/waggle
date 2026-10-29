export class MemberError extends Error {
  constructor(
    public readonly code: "invalid" | "unauthorized" | "conflict" | "rate_limited" | "unavailable",
    public readonly publicMessage: string,
  ) {
    super(code);
  }
}
export function denied(): never {
  throw new MemberError("unauthorized", "코드 또는 세션을 확인해주세요.");
}
export function memberUnavailable(): never {
  throw new MemberError("unavailable", "사용자 인증 저장소를 사용할 수 없습니다.");
}
export function memberInvalid(): never {
  throw new MemberError("invalid", "입력 항목의 형식과 길이를 확인해주세요.");
}
