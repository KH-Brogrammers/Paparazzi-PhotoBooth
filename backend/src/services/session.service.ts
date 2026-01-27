export class SessionService {
  private static groupSessions: Map<string, { timestamp: number; folder: string }> = new Map();
  private static readonly SESSION_TIMEOUT = 10000; // 10 seconds

  static getGroupSession(groupId: string): { timestamp: number; folder: string } {
    const now = Date.now();
    const existing = this.groupSessions.get(groupId);

    // If no session or session is too old, create new one
    if (!existing || now - existing.timestamp > this.SESSION_TIMEOUT) {
      // Convert to IST (UTC+5:30)
      const date = new Date(now + (5.5 * 60 * 60 * 1000));
      const timeFolder = `${date.getUTCHours().toString().padStart(2, "0")}:${date.getUTCMinutes().toString().padStart(2, "0")}:${date.getUTCSeconds().toString().padStart(2, "0")}_${date.getUTCDate().toString().padStart(2, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCFullYear()}_${groupId}`;

      const session = { timestamp: now, folder: timeFolder };
      this.groupSessions.set(groupId, session);
      console.log(`📁 Created new session for ${groupId}: ${timeFolder}`);
      return session;
    }

    console.log(`📁 Using existing session for ${groupId}: ${existing.folder}`);
    return existing;
  }
}
