import assert from "node:assert/strict";
import test from "node:test";
import type { SchoolSnapshot } from "../apps/admin/src/shared/school";
import { filterAccessPoints } from "../apps/admin/src/shared/school-filters";

const snapshot: SchoolSnapshot = {
  version: 1,
  networks: [
    {
      id: "n",
      name: "합성 연결",
      ssid: "QA WiFi",
      security: "open",
      enabled: false,
      hasPassword: false,
      revision: 1,
      updatedAt: "",
      apCount: 2,
    },
  ],
  accessPoints: [
    {
      id: "a",
      networkId: "n",
      name: "합성 AP 1",
      bssid: "02:00:00:00:00:01",
      building: "검증동",
      floor: "2",
      place: "검증실",
      enabled: true,
      effectiveEnabled: false,
      locationRegistered: true,
      revision: 1,
      updatedAt: "",
    },
    {
      id: "b",
      networkId: "n",
      name: "합성 AP 2",
      bssid: "02:00:00:00:00:02",
      building: "검증동",
      floor: "",
      place: "",
      enabled: true,
      effectiveEnabled: false,
      locationRegistered: false,
      revision: 1,
      updatedAt: "",
    },
  ],
};
test("AP 검색은 SSID·BSSID·장소를 포함하고 근처 여부·비활성 상태로 등록 항목을 숨기지 않는다", () => {
  assert.equal(filterAccessPoints(snapshot, {}).length, 2);
  assert.equal(filterAccessPoints(snapshot, { query: "qa wifi" }).length, 2);
  assert.deepEqual(
    filterAccessPoints(snapshot, { query: "00:02" }).map((a) => a.id),
    ["b"],
  );
  assert.deepEqual(
    filterAccessPoints(snapshot, { query: "검증실" }).map((a) => a.id),
    ["a"],
  );
});
test("건물·층·위치 미등록 필터를 함께 적용한다", () => {
  assert.deepEqual(
    filterAccessPoints(snapshot, { building: "검증동", floor: "2" }).map((a) => a.id),
    ["a"],
  );
  assert.deepEqual(
    filterAccessPoints(snapshot, { building: "검증동", missing: true }).map((a) => a.id),
    ["b"],
  );
  assert.equal(filterAccessPoints(snapshot, { floor: "2", missing: true }).length, 0);
});
