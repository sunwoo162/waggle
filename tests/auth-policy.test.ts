import assert from "node:assert/strict";
import test from "node:test";
import { readAuthConfig } from "../apps/admin/src/server/auth/config";
import {
  isEligibleStudent,
  parseDataGsmProfile,
  selectOperatorProfile,
} from "../apps/admin/src/server/auth/policy";

const env = {
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  BETTER_AUTH_SECRET: "unit-test-secret-with-at-least-32-characters",
  DATAGSM_CLIENT_ID: "fixture-client",
  WAGGLE_ADMIN_DATAGSM_ID: "42",
};
const student = {
  id: 42,
  email: "fixture@gsm.hs.kr",
  role: "USER",
  status: "ACTIVE",
  objectType: "STUDENT",
  student: {
    id: 999,
    name: "테스트 사용자",
    role: "GENERAL_STUDENT",
    isLeaveSchool: false,
    dormitoryRoom: 999,
  },
};

test("설정이 없으면 필요한 이름만 반환하고 값을 노출하지 않는다", () => {
  const result = readAuthConfig({});
  assert.equal(result.ready, false);
  if (!result.ready) assert.deepEqual(result.missing.sort(), Object.keys(env).sort());
  assert.ok(
    !JSON.stringify(readAuthConfig({ ...env, BETTER_AUTH_SECRET: "private-short" })).includes(
      "private-short",
    ),
  );
});

test("loopback과 HTTPS origin만 허용한다", () => {
  for (const url of [
    env.BETTER_AUTH_URL,
    "http://localhost:3000",
    "http://[::1]:3000",
    "https://example.com",
  ]) {
    assert.equal(readAuthConfig({ ...env, BETTER_AUTH_URL: url }).ready, true, url);
  }
  for (const url of [
    "http://example.com",
    "http://127.0.0.1.evil.test",
    "https://example.com/path",
    "https://user:pass@example.com",
    "https://example.com?next=a",
    "https://example.com#x",
  ]) {
    assert.equal(readAuthConfig({ ...env, BETTER_AUTH_URL: url }).ready, false, url);
  }
});

test("짧은 비밀값과 여러 운영자·잘못된 사용자 ID를 거부한다", () => {
  assert.equal(readAuthConfig({ ...env, BETTER_AUTH_SECRET: "short" }).ready, false);
  for (const id of ["", "0", "-1", "42,43", "42.5", "4e2", "9223372036854775808"]) {
    assert.equal(readAuthConfig({ ...env, WAGGLE_ADMIN_DATAGSM_ID: id }).ready, false, id);
  }
});

test("제공자 계정 ID를 사용하고 불필요한 상세 정보는 남기지 않는다", () => {
  const profile = parseDataGsmProfile(student);
  assert.deepEqual(profile, {
    id: "42",
    email: "fixture@gsm.hs.kr",
    name: "테스트 사용자",
    status: "ACTIVE",
  });
  assert.equal(JSON.stringify(profile).includes("dormitory"), false);
  assert.equal(selectOperatorProfile(student, "42")?.id, "42");
  assert.equal(selectOperatorProfile({ ...student, id: 43, role: "ADMIN" }, "42"), null);
  assert.equal(selectOperatorProfile({ ...student, status: "PENDING" }, "42"), null);
});

test("잘못되거나 정밀도를 잃은 프로필은 거부한다", () => {
  for (const profile of [
    null,
    {},
    { ...student, id: Number.MAX_SAFE_INTEGER + 1 },
    { ...student, id: -1 },
    { ...student, email: "invalid" },
    { ...student, status: "UNKNOWN" },
  ]) {
    assert.equal(parseDataGsmProfile(profile), null);
  }
  assert.equal(
    parseDataGsmProfile({ ...student, id: "9223372036854775807" })?.id,
    "9223372036854775807",
  );
});

test("활성 학생 중 허용된 재학생 역할만 인정한다", () => {
  assert.equal(isEligibleStudent(student), true);
  for (const patch of [
    { status: "PENDING" },
    { objectType: "TEACHER" },
    { student: null },
    { student: { ...student.student, role: "GRADUATE" } },
    { student: { ...student.student, role: "WITHDRAWN" } },
    { student: { ...student.student, role: "UNKNOWN" } },
    { student: { ...student.student, isLeaveSchool: true } },
    { student: { role: "GENERAL_STUDENT" } },
  ])
    assert.equal(isEligibleStudent({ ...student, ...patch }), false);
});
