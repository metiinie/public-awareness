export default class Expo {
  chunkPushNotifications(messages: any[]) {
    return [messages];
  }
  async sendPushNotificationsAsync(chunks: any[]) {
    return chunks.map(() => ({ status: 'ok' }));
  }
}
export class ExpoPushMessage {}
export class ExpoPushTicket {}
