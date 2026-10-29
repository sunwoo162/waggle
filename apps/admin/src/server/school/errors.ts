export class SchoolError extends Error {
  constructor(
    public readonly code: "invalid" | "conflict" | "not_found" | "unavailable",
    public readonly publicMessage: string,
    public readonly field?: string,
  ) {
    super(code);
  }
}
export function invalid(field: string, message: string): never {
  throw new SchoolError("invalid", message, field);
}
export function unavailable(): never {
  throw new SchoolError(
    "unavailable",
    "설정 저장소를 사용할 수 없습니다. 운영 설정을 확인해주세요.",
  );
}
