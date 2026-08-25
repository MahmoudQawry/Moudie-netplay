import { Room } from '../types/room';

export class VoiceManager {
  private liveKitClient: any; // افترض أنك تستخدم مكتبة LiveKit

  // دالة انضمام للصوت (يُطبّق عند دخول أي مستخدم)
  async configureVoiceForUser(room: Room, userId: string, isSpectator: boolean) {
    const token = this.liveKitClient.generateToken(userId, room.id);

    // **الجزء الجذري**: نمنع أي مستخدم من البث المباشر للآخرين
    const permissions = {
      canPublish: false,      // 🛑 ممنوع البث للاعبين والمشاهدين على حد سواء
      canSubscribe: true,     // ✅ مسموح بالاستماع فقط
      canPublishData: false,  // ممنوع إرسال بيانات الصوت مباشرة
    };

    // **المضيف فقط** له صلاحية البث إلى الخادم (وليس إلى المستخدمين)
    if (userId === room.hostId) {
      permissions.canPublish = true; // يرفع الصوت إلى الخادم
    }

    // **المشاهدون** لا يرفعون صوت أصلاً (اكتفاء بالاستماع)
    if (isSpectator) {
      permissions.canPublish = false;
    }

    // تطبيق الصلاحيات على جلسة المستخدم
    await this.liveKitClient.updateParticipantPermissions(room.id, userId, permissions);

    console.log(`✅ تم ضبط الصوت لـ ${userId} بحيث يبث إلى الخادم فقط، والخادم يوزعه`);
  }
}
