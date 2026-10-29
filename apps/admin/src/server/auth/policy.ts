export type DataGsmProfile = {
  id: string;
  email: string;
  name: string;
  status: "ACTIVE" | "PENDING";
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeSubject(value: unknown): string | null {
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value)) return null;
  return BigInt(value) <= BigInt("9223372036854775807") ? value : null;
}

export function parseDataGsmProfile(input: unknown): DataGsmProfile | null {
  const raw = record(input);
  if (!raw) return null;
  const id = normalizeSubject(raw.id);
  if (!id || typeof raw.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email))
    return null;
  if (raw.status !== "ACTIVE" && raw.status !== "PENDING") return null;
  const detail =
    raw.objectType === "STUDENT"
      ? record(raw.student)
      : raw.objectType === "TEACHER"
        ? record(raw.teacher)
        : null;
  const name =
    typeof detail?.name === "string" && detail.name.trim()
      ? detail.name.trim().slice(0, 100)
      : "DataGSM 사용자";
  return { id, email: raw.email.trim(), name, status: raw.status };
}

export function selectOperatorProfile(
  input: unknown,
  operatorSubject: string,
): DataGsmProfile | null {
  const profile = parseDataGsmProfile(input);
  return profile?.status === "ACTIVE" && profile.id === normalizeSubject(operatorSubject)
    ? profile
    : null;
}

export function isEligibleStudent(input: unknown): boolean {
  const raw = record(input);
  const student = record(raw?.student);
  const roles = new Set(["GENERAL_STUDENT", "STUDENT_COUNCIL", "DORMITORY_MANAGER"]);
  return (
    parseDataGsmProfile(input)?.status === "ACTIVE" &&
    raw?.objectType === "STUDENT" &&
    student?.isLeaveSchool === false &&
    typeof student.role === "string" &&
    roles.has(student.role)
  );
}
