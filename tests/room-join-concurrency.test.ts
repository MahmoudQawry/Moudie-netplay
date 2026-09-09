import { describe, expect, it } from "vitest";
import { addRoomMemberWithCapacity } from "../server/db";
import { roomCapacityFor } from "../shared/room-capacity";

/** Behavioral concurrency test for atomic seat reservation.
 *
 * The fake database serializes every `transaction()` body exactly like an
 * InnoDB `SELECT ... FOR UPDATE` row lock on the room row: one transaction at
 * a time, each seeing the committed state of the previous one. 24 concurrent
 * join attempts must therefore end with exactly the capacity limit (8 members
 * for PS1: 1 host + 3 players + 4 spectators) and never oversell a seat. */

type FakeMember = { roomId: number; role: string; displayName: string; accessTokenHash: string };

function createFakeDb(system: "ps1" | "nes" = "ps1") {
  const room = { id: 1, status: "waiting", system };
  const members: FakeMember[] = [{ roomId: 1, role: "host", displayName: "Host", accessTokenHash: "host-hash" }];
  let insertId = 100;
  let chain: Promise<unknown> = Promise.resolve();

  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const fakeTx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            for: async () => [room],
          }),
          // Members path: `tx.select({role}).from(roomMembers).where(...)` is awaited directly.
          then: (resolve: (rows: FakeMember[]) => void, reject: (error: unknown) => void) =>
            Promise.resolve(members.filter((member) => member.roomId === room.id)).then(resolve, reject),
        }),
      }),
    }),
    insert: () => ({
      values: async (values: FakeMember) => {
        members.push(values);
        return [{ insertId: ++insertId }];
      },
    }),
  };

  const fakeDb = {
    transaction: <T>(body: (tx: typeof fakeTx) => Promise<T>): Promise<T> => serialize(() => body(fakeTx)),
  };

  return { fakeDb: fakeDb as unknown as Parameters<typeof addRoomMemberWithCapacity>[1], members, room };
}

describe("atomic seat reservation under concurrency", () => {
  it("never exceeds capacity when 24 joins race a PS1 room (serialized by FOR UPDATE)", async () => {
    const { fakeDb, members } = createFakeDb("ps1");
    const capacity = roomCapacityFor("ps1"); // 4 players + 4 spectators = 8 total
    const attempts = [
      ...Array.from({ length: 10 }, (_, index) => ({ role: "player" as const, name: `P${index}` })),
      ...Array.from({ length: 14 }, (_, index) => ({ role: "spectator" as const, name: `S${index}` })),
    ];

    const results = await Promise.allSettled(
      attempts.map((attempt, index) =>
        addRoomMemberWithCapacity(
          {
            roomId: 1,
            displayName: attempt.name,
            accessTokenHash: `hash-${index}`,
            role: attempt.role,
            maxPlayers: capacity.maxPlayers,
            maxSpectators: capacity.maxSpectators,
          },
          fakeDb,
        ),
      ),
    );

    const admitted = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(admitted.length).toBe(7); // 3 player seats + 4 spectator seats beyond the host
    expect(rejected.length).toBe(17);
    expect(members.length).toBe(8);

    const activePlayers = members.filter((member) => member.role === "host" || member.role === "player").length;
    const spectators = members.filter((member) => member.role === "spectator").length;
    expect(activePlayers).toBe(capacity.maxPlayers);
    expect(spectators).toBe(capacity.maxSpectators);
  });

  it("keeps the Famicom 2+6 split under the same racing joins", async () => {
    const { fakeDb, members } = createFakeDb("nes");
    const capacity = roomCapacityFor("nes"); // 2 players + 6 spectators
    const attempts = [
      ...Array.from({ length: 8 }, (_, index) => ({ role: "player" as const, name: `P${index}` })),
      ...Array.from({ length: 12 }, (_, index) => ({ role: "spectator" as const, name: `S${index}` })),
    ];

    const results = await Promise.allSettled(
      attempts.map((attempt, index) =>
        addRoomMemberWithCapacity(
          {
            roomId: 1,
            displayName: attempt.name,
            accessTokenHash: `hash-${index}`,
            role: attempt.role,
            maxPlayers: capacity.maxPlayers,
            maxSpectators: capacity.maxSpectators,
          },
          fakeDb,
        ),
      ),
    );

    const admitted = results.filter((result) => result.status === "fulfilled");
    expect(admitted.length).toBe(7); // 1 player seat + 6 spectator seats beyond the host
    expect(members.length).toBe(8);
  });

  it("refuses joins once the room is no longer waiting", async () => {
    const { fakeDb, room } = createFakeDb("ps1");
    room.status = "active";
    await expect(
      addRoomMemberWithCapacity(
        { roomId: 1, displayName: "Late", accessTokenHash: "hash-late", role: "player", maxPlayers: 4, maxSpectators: 4 },
        fakeDb,
      ),
    ).rejects.toThrow("الغرفة غير متاحة للانضمام.");
  });
});
