// أنواع الأنظمة المدعومة
export enum SystemType {
  FAMICOM = 'famicom',   // كمبيوتر العائلة
  PSP = 'psp',
  PS1 = 'ps1',
  SEGA = 'sega',
  ARCADE = 'arcade'
}

// القوانين الصارمة للغرف (كما طلبت)
export const ROOM_LIMITS: Record<SystemType, { maxPlayers: number; maxSpectators: number }> = {
  [SystemType.FAMICOM]: { maxPlayers: 2, maxSpectators: 6 },  // مميز
  [SystemType.PSP]:    { maxPlayers: 6, maxSpectators: 2 },
  [SystemType.PS1]:    { maxPlayers: 6, maxSpectators: 2 },
  [SystemType.SEGA]:   { maxPlayers: 6, maxSpectators: 2 },
  [SystemType.ARCADE]: { maxPlayers: 6, maxSpectators: 2 },
};

// هيكل الغرفة المطور
export interface Room {
  id: string;
  system: SystemType;
  gameName: string;
  players: string[];      // أقصى 6
  spectators: string[];   // أقصى 6 (حسب النظام)
  hostId: string;
  isActive: boolean;
  netplayToken: string;   // رمز المزامنة الموحد
    }
