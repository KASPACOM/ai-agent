import { Context } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { InputEvent } from '../../orchestrator/models/message.model';

export class TelegramHelper {
  /**
   * Convert a Telegram context to an InputEvent
   */
  static contextToInputEvent(ctx: Context<Update>): InputEvent | null {
    // Handle text messages
    if ('text' in ctx.message) {
      return {
        chatId: ctx.chat.id.toString(),
        content: ctx.message.text,
        userId: ctx.from.id.toString(),
        timestamp: new Date(),
        metadata: {
          platform: 'telegram',
          messageId: ctx.message.message_id,
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
        },
      };
    }

    // Handle voice messages
    if ('voice' in ctx.message) {
      return {
        chatId: ctx.chat.id.toString(),
        content: '[Voice Message]',
        userId: ctx.from.id.toString(),
        timestamp: new Date(),
        metadata: {
          platform: 'telegram',
          messageId: ctx.message.message_id,
          messageType: 'voice',
          fileId: ctx.message.voice.file_id,
          duration: ctx.message.voice.duration,
        },
      };
    }

    // Handle photo messages
    if ('photo' in ctx.message) {
      const photoObj = ctx.message.photo[ctx.message.photo.length - 1]; // Get best quality
      const caption = ctx.message.caption || '[Photo Message]';

      return {
        chatId: ctx.chat.id.toString(),
        content: caption,
        userId: ctx.from.id.toString(),
        timestamp: new Date(),
        metadata: {
          platform: 'telegram',
          messageId: ctx.message.message_id,
          messageType: 'photo',
          fileId: photoObj.file_id,
          width: photoObj.width,
          height: photoObj.height,
        },
      };
    }

    // Unsupported message type
    return null;
  }
}
