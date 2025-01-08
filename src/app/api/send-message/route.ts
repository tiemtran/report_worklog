import { User } from "@/consts";
import { exportWorklogsToSheet, formatMessage } from "@/services";
import { Bot } from "grammy";
import moment from "moment";
import { NextResponse } from "next/server";

interface RequestBody {
  //   eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface ResponseData {
  success: boolean;
  message?: string;
  error?: unknown;
}

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token)
  throw new Error("TELEGRAM_BOT_TOKEN environment variable not found.");

const bot = new Bot(token);

export async function POST(
  request: Request
): Promise<NextResponse<ResponseData>> {
  const body: RequestBody = await request.json();
  try {
    const user = body?.user;

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" });
    }

    const userKey = user.username as keyof typeof User;

    const userJira = User[userKey];

    if (!userJira) {
      return NextResponse.json({
        success: false,
        message: `Thông tin người dùng: ${user.username} chưa được khai báo`,
      });
    }

    if (body.textNotification) {
      await bot.api.sendMessage(Number(user.id), body.textNotification);
    } else {
      const data = await exportWorklogsToSheet({
        assignee: User[user.username as keyof typeof User],
        filterDate: moment().format("YYYY-MM-DD"),
      });

      if (data) {
        const result = formatMessage(data ?? []);
        await bot.api.sendMessage(
          Number(user.id),
          "**Đây là tin nhắn tự động được gửi lúc 18h30**"
        );
        await bot.api.sendMessage(Number(user.id), result, {
          parse_mode: "MarkdownV2",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Message sent successfully! ${user.username}`,
    });
  } catch (error) {
    console.error("Error processing user:", error);
    return NextResponse.json({ success: false, error: error });
  }
}
