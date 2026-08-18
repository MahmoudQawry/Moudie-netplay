import { useCallback, useEffect, useState } from "react";

import { getRealtimeRoomSnapshot, type RealtimeSnapshot } from "@/lib/realtime-room-service";
import type { RoomCredential } from "@/lib/room-storage";

export function useRealtimeRoomSnapshot(roomId: number, credential: RoomCredential | null | undefined, refreshInterval = 3_000) {
  const [data, setData] = useState<RealtimeSnapshot | undefined>();
  const [isLoading, setIsLoading] = useState(Boolean(credential));
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!credential || !Number.isFinite(roomId)) return;
    try {
      setError(null);
      const snapshot = await getRealtimeRoomSnapshot({ roomId, memberId: credential.memberId, memberToken: credential.memberToken });
      setData(snapshot);
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("Could not load room details."));
    } finally {
      setIsLoading(false);
    }
  }, [credential, roomId]);

  useEffect(() => {
    setData(undefined);
    setError(null);
    setIsLoading(Boolean(credential));
    void refetch();
    if (!credential || !Number.isFinite(roomId)) return;
    const interval = setInterval(() => void refetch(), refreshInterval);
    return () => clearInterval(interval);
  }, [credential, refreshInterval, refetch, roomId]);

  return { data, isLoading, error, refetch };
}
