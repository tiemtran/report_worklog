import { User } from "@/consts";
import {
  exportWorklogsToSheet,
  formatMessage
} from "@/services";
import { getAllUsersFromTurso } from "@/services/db";
import { Bot } from "grammy";
import moment from "moment";
import { NextResponse } from "next/server";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token)
  throw new Error("TELEGRAM_BOT_TOKEN environment variable not found.");

const bot = new Bot(token);

export async function GET() {
  const users = await getAllUsersFromTurso();

  try {
    const message = "**Đây là tin nhắn tự động được gửi lúc 18h30**";

    if (users?.length) {
      users.forEach(async (user) => {
        if (user.id) {
          const data = await exportWorklogsToSheet(
            User[user.username as keyof typeof User],
            0,
            moment().format("YYYY-MM-DD")
          );
          if (data) {
            const result = formatMessage(data ?? []);

            await bot.api.sendMessage(Number(user.id), message);
            await bot.api.sendMessage(Number(user.id), result, {
              parse_mode: "MarkdownV2",
            });
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: "Messages sent successfully!",
    });
  } catch (error) {
    console.error("Error sending messages:", error);
    return NextResponse.json({ success: false, error: error });
  }
}
