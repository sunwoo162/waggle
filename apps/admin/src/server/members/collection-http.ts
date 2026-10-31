import { jsonPrivate as json, readJson } from "../http";
import { characterResponse } from "../school/character-http";
import type { CharacterStore } from "../school/characters";
import { clientRequest } from "./client-request";
import type { MemberService } from "./service";

export function createCollectionHandler(deps: {
  getMembers: () => MemberService;
  getStore: () => CharacterStore;
  origin: () => string;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const access = clientRequest(
        request,
        "/api/client/collection",
        ["GET", "POST"],
        deps.origin(),
      );
      if (access instanceof Response) return access;
      const members = deps.getMembers();
      const identity = await members.collectionAccess(access.token);
      // Collected records are kept, but apps only learn about currently published characters.
      const visible = (collection: { schemaVersion: 1; apIds: string[] }) => {
        const published = new Set(
          deps
            .getStore()
            .catalog()
            .characters.map((c) => c.id),
        );
        return { ...collection, apIds: collection.apIds.filter((id) => published.has(id)) };
      };
      if (request.method === "GET") return json(visible(members.mergeCollection(identity)));
      const body = await readJson(request);
      if ("error" in body)
        return json({ message: "연결 보고의 JSON 형식과 용량을 확인해주세요." }, body.error);
      const apIds = deps.getStore().validateReports(body.value);
      return json(visible(members.mergeCollection(identity, apIds)));
    } catch (error) {
      return characterResponse(error);
    }
  };
}
