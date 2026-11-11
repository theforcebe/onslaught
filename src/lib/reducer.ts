import { RequestSchema, StateSchema } from "./model";
import type { RaidState, Identity, ChangeRequest } from "./model";
import { parseSimc, rejectCredentials } from "./parser";
export class ChangeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function isAdmin(state: RaidState, actor: Identity) {
  return actor.provider === "github"
    ? state.guild.adminsGithub.some(
        (a) => a.toLowerCase() === actor.id.toLowerCase(),
      )
    : actor.admin === true;
}
export function applyChange(
  current: RaidState,
  input: ChangeRequest,
  actor: Identity,
  at = new Date().toISOString(),
): RaidState {
  const req = RequestSchema.parse(input);
  try {
    rejectCredentials(req);
  } catch {
    throw new ChangeError(
      "This change appears to contain a credential. Remove it before sharing.",
    );
  }
  const s = structuredClone(StateSchema.parse(current));
  if (s.processedRequests.includes(req.id)) return s;
  if (req.expectedRevision !== s.revision)
    throw new ChangeError(
      "The guild changed since you opened this view. Refresh and review your change again.",
      409,
    );
  const a = req.action,
    admin = isAdmin(s, actor);
  if (
    !admin &&
    actor.provider === "github" &&
    !s.guild.membersGithub.some(
      (m) => m.toLowerCase() === actor.id.toLowerCase(),
    ) &&
    !s.characters.some(
      (c) => c.ownerGithub?.toLowerCase() === actor.id.toLowerCase(),
    )
  )
    throw new ChangeError(
      "Your GitHub account needs a guild invitation before making changes.",
      403,
    );
  const needAdmin = () => {
    if (!admin)
      throw new ChangeError("Only a guild admin can make this change.", 403);
  };
  const char = (id: string) => {
    const c = s.characters.find((c) => c.id === id);
    if (!c) throw new ChangeError("Character not found.", 404);
    return c;
  };
  const own = (id: string) => {
    const c = char(id);
    if (
      !admin &&
      (actor.provider === "github"
        ? c.ownerGithub?.toLowerCase() !== actor.id.toLowerCase()
        : c.ownerBattleNet !== actor.id)
    )
      throw new ChangeError("You can only update your own character.", 403);
    return c;
  };
  const update = <T extends { id: string }>(list: T[], item: T) => {
    const i = list.findIndex((x) => x.id === item.id);
    if (i < 0) list.push(item);
    else list[i] = item;
  };
  let summary = "";
  switch (a.type) {
    case "character.import": {
      const snapshot = parseSimc(a.raw, at);
      let c = s.characters.find((c) => c.id === a.characterId);
      if (c) {
        own(c.id);
        if (
          c.snapshot &&
          (c.snapshot.name.toLowerCase() !== snapshot.name.toLowerCase() ||
            c.snapshot.server !== snapshot.server ||
            c.snapshot.region !== snapshot.region)
        )
          throw new ChangeError(
            "This export belongs to a different character or realm. Import it as a new character.",
          );
      } else {
        if (
          s.characters.some(
            (x) =>
              x.name.toLowerCase() === snapshot.name.toLowerCase() &&
              x.snapshot?.server === snapshot.server &&
              x.snapshot?.region === snapshot.region,
          )
        )
          throw new ChangeError(
            "This character is already on the roster. Ask an admin to assign ownership.",
          );
        c = {
          id: a.characterId,
          name: snapshot.name,
          class: snapshot.class,
          level: snapshot.level,
          role: "unassigned",
          spec: snapshot.spec === "unknown" ? "" : snapshot.spec,
          notes: "",
          ...(actor.provider === "github"
            ? { ownerGithub: actor.id }
            : { ownerBattleNet: actor.id }),
        };
        s.characters.push(c);
      }
      Object.assign(c, {
        name: snapshot.name,
        class: snapshot.class,
        level: snapshot.level,
        snapshot,
      });
      summary = `Imported ${c.name}'s equipment`;
      break;
    }
    case "character.update": {
      const c = own(a.characterId);
      Object.assign(c, { role: a.role, spec: a.spec, notes: a.notes });
      summary = `Updated ${c.name}'s raid profile`;
      break;
    }
    case "character.owner": {
      needAdmin();
      char(a.characterId).ownerGithub = a.github;
      summary = `Assigned character ownership to ${a.github}`;
      break;
    }
    case "team.save": {
      needAdmin();
      if (a.team.tanks + a.team.healers > a.team.size)
        throw new ChangeError("Role targets exceed team size.");
      const members = s.characters.filter((c) => c.teamId === a.team.id);
      if (
        members.length > a.team.size ||
        members.some((c) => (c.group || 1) > Math.ceil(a.team.size / 5))
      )
        throw new ChangeError("Move members before reducing team size.");
      update(s.teams, a.team);
      summary = `Updated ${a.team.name}`;
      break;
    }
    case "team.unassign": {
      needAdmin();
      const c = char(a.characterId);
      delete c.teamId;
      delete c.group;
      summary = `Moved ${c.name} to the bench`;
      break;
    }
    case "team.assign": {
      needAdmin();
      const c = char(a.characterId),
        team = s.teams.find((t) => t.id === a.teamId);
      if (!team) throw new ChangeError("Team not found.");
      const others = s.characters.filter(
        (x) => x.teamId === team.id && x.id !== c.id,
      );
      if (
        a.group > Math.ceil(team.size / 5) ||
        others.length >= team.size ||
        others.filter((x) => x.group === a.group).length >=
          Math.min(5, team.size - (a.group - 1) * 5)
      )
        throw new ChangeError("That group or team is full.");
      c.teamId = team.id;
      c.group = a.group;
      summary = `Moved ${c.name} to ${team.name}, group ${a.group}`;
      break;
    }
    case "event.save": {
      needAdmin();
      if (Date.parse(a.event.end) <= Date.parse(a.event.start))
        throw new ChangeError("Raid end must be after its start.");
      if (!s.teams.some((t) => t.id === a.event.teamId))
        throw new ChangeError("Choose an existing team.");
      try {
        Intl.DateTimeFormat("en", { timeZone: a.event.timeZone });
      } catch {
        throw new ChangeError("Choose a valid IANA time zone.");
      }
      const prev = s.events.find((e) => e.id === a.event.id);
      update(s.events, { ...a.event, signups: prev?.signups || {} });
      summary = `Scheduled ${a.event.title}`;
      break;
    }
    case "event.signup": {
      const c = own(a.characterId),
        e = s.events.find((e) => e.id === a.eventId);
      if (!e) throw new ChangeError("Raid not found.");
      e.signups[c.id] = a.status;
      summary = `${c.name} marked ${a.status} for ${e.title}`;
      break;
    }
    case "supply.save": {
      needAdmin();
      const prev = s.supplies.find((x) => x.id === a.supply.id);
      if (a.supply.eventId && !s.events.some((e) => e.id === a.supply.eventId))
        throw new ChangeError("Raid not found.");
      update(s.supplies, { ...a.supply, pledges: prev?.pledges || {} });
      summary = `Updated ${a.supply.name} target`;
      break;
    }
    case "supply.pledge": {
      const c = own(a.characterId),
        supply = s.supplies.find((x) => x.id === a.supplyId);
      if (!supply) throw new ChangeError("Supply not found.");
      supply.pledges[c.id] = a.quantity;
      summary = `${c.name} committed ${a.quantity} ${supply.name}`;
      break;
    }
    case "loot.save": {
      needAdmin();
      if (
        a.loot.priority.some((id) => !s.characters.some((c) => c.id === id)) ||
        new Set(a.loot.priority).size !== a.loot.priority.length
      )
        throw new ChangeError(
          "Priority list must contain unique roster characters.",
        );
      const prev = s.loot.find((l) => l.id === a.loot.id);
      if (prev?.awardedTo)
        throw new ChangeError(
          "Awarded drops are immutable. Create a new drop for another kill.",
        );
      update(s.loot, {
        ...a.loot,
        requests: prev?.requests || {},
        awardedTo: undefined,
        awardReason: undefined,
        awardedAt: undefined,
      });
      summary = `Updated priority for ${a.loot.name}`;
      break;
    }
    case "loot.request": {
      const c = own(a.characterId),
        l = s.loot.find((x) => x.id === a.lootId);
      if (!l) throw new ChangeError("Drop not found.");
      if (l.awardedTo)
        throw new ChangeError("This drop has already been awarded.");
      if (l.eligible.length && !l.eligible.includes(c.class))
        throw new ChangeError("Your class is not eligible for this drop.");
      l.requests[c.id] = { tier: a.tier, note: a.note };
      summary = `${c.name} requested ${l.name}`;
      break;
    }
    case "loot.award": {
      needAdmin();
      const c = char(a.characterId),
        l = s.loot.find((x) => x.id === a.lootId);
      if (!l) throw new ChangeError("Drop not found.");
      if (l.awardedTo)
        throw new ChangeError("This drop has already been awarded.");
      if (l.eligible.length && !l.eligible.includes(c.class))
        throw new ChangeError("Recipient is not eligible for this drop.");
      l.awardedTo = c.id;
      l.awardReason = a.reason;
      l.awardedAt = at;
      summary = `Awarded ${l.name} to ${c.name}: ${a.reason}`;
      break;
    }
    case "boss.save": {
      needAdmin();
      update(s.bosses, a.boss);
      summary = `Updated ${a.boss.name}: ${a.boss.status}`;
      break;
    }
    case "guild.update": {
      needAdmin();
      try {
        Intl.DateTimeFormat("en", { timeZone: a.timeZone });
      } catch {
        throw new ChangeError("Invalid IANA time zone.");
      }
      Object.assign(s.guild, {
        name: a.name,
        timeZone: a.timeZone,
        adminsGithub: a.adminsGithub,
        membersGithub: a.membersGithub,
      });
      summary = "Updated guild settings";
      break;
    }
  }
  s.revision++;
  s.processedRequests.push(req.id);
  s.audit.unshift({
    id: req.id,
    at,
    actor: actor.provider === "battlenet" ? "Battle.net member" : actor.label,
    action: a.type,
    summary,
  });
  return StateSchema.parse(s);
}
