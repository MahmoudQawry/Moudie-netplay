import { Room, SystemType, ROOM_LIMITS } from '../types/room';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  // دالة إنشاء غرفة ذكية
  createRoom(hostId: string, system: SystemType, gameName: string): Room {
    const limits = ROOM_LIMITS[system];
    const newRoom: Room = {
      id: this.generateRoomId(),
      system,
      gameName,
      players: [hostId],
      spectators: [],
      hostId,
      isActive: true,
      netplayToken: this.generateNetplayToken(), // رمز موحد لجميع المحاكيات
    };
    this.rooms.set(newRoom.id, newRoom);
    return newRoom;
  }

  // دالة انضمام ذكية (تمنع التجاوز)
  joinRoom(roomId: string, userId: string, asSpectator: boolean = false): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const limits = ROOM_LIMITS[room.system];

    if (asSpectator) {
      if (room.spectators.length >= limits.maxSpectators) {
        throw new Error(`لا يمكن زيادة المشاهدين عن ${limits.maxSpectators}`);
      }
      room.spectators.push(userId);
      return true;
    } else {
      if (room.players.length >= limits.maxPlayers) {
        throw new Error(`لا يمكن زيادة اللاعبين عن ${limits.maxPlayers}`);
      }
      room.players.push(userId);
      return true;
    }
  }

  // توليد رمز مزامنة موحد يعمل مع جميع المحاكيات
  private generateNetplayToken(): string {
    return `retroarch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
  }
