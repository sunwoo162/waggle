import type { SchoolSnapshot } from "./school";
export function filterAccessPoints(
  snapshot: SchoolSnapshot,
  filters: { query?: string; building?: string; floor?: string; missing?: boolean },
) {
  const query = filters.query?.trim().toLocaleLowerCase() || "";
  const networks = new Map(snapshot.networks.map((n) => [n.id, n]));
  return snapshot.accessPoints.filter((ap) => {
    const network = networks.get(ap.networkId);
    return (
      (!filters.building || ap.building === filters.building) &&
      (!filters.floor || ap.floor === filters.floor) &&
      (!filters.missing || !ap.locationRegistered) &&
      (!query ||
        [ap.name, ap.bssid, ap.building, ap.floor, ap.place, network?.name, network?.ssid]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query))
    );
  });
}
