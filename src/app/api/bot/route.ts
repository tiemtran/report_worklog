export const dynamic = "force-dynamic";

export const fetchCache = "force-no-store";

import { User } from "@/consts";
import {
  exportWorklogsToSheet,
  generateTelegramMessage,
  validateDateFormat,
} from "@/services";
import { saveToTurso } from "@/services/db";
import { checkAndSaveToRedis } from "@/services/redis";
import { Bot, webhookCallback } from "grammy";
// import { Menu } from '@grammyjs/menu';

const token = process.env.TELEGRAM_BOT_TOKEN;

// const messageCounts: Record<number, { count: number; lastMessage: number }> =
//   {};

if (!token)
  throw new Error("TELEGRAM_BOT_TOKEN environment variable not found.");

const bot = new Bot(token);

// Xử lý tin nhắn khi người dùng nhấn nút
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const user = ctx.message.from;

  // Kiểm tra và lấy username hoặc tên đầy đủ
  if (!user) {
    await ctx.reply("Không thể xác định người dùng.");
    return;
  }

  // console.log("messageCounts::", messageCounts);
  // if (!messageCounts[user.id]) {
  //   messageCounts[user.id] = { count: 1, lastMessage: now };
  // } else {
  //   const { count, lastMessage } = messageCounts[user.id];
  //   console.log("Now - lastMessage::", now - lastMessage);
  //   console.log("count::", count);
  //   // Kiểm tra nếu tin nhắn gửi quá nhanh (ví dụ: cách nhau dưới 5 giây)
  //   if (now - lastMessage < 2000) {
  //     messageCounts[user.id].count += 1;
  //   } else {
  //     // Reset lại nếu vượt quá 2 giây
  //     messageCounts[user.id] = { count: 1, lastMessage: now };
  //     if (count > 2) {
  //       return ctx.reply(
  //         "Bạn đang gửi quá nhiều tin nhắn. Vui lòng thử lại sau."
  //       );
  //     }
  //   }
  // }

  const username = user.username ?? "demo";
  const userKey = username as keyof typeof User;

  if (!User[userKey]) {
    await ctx.reply(`Không tìm thấy thông tin cho người dùng: ${username}`);
    return;
  }

  // Kiểm tra và lưu vào Redis trước
  const existsInRedis = await checkAndSaveToRedis(user.id, username);

  // Nếu chưa tồn tại trong Redis, lưu vào Turso
  if (!existsInRedis) {
    await saveToTurso(user.id, username);
  }

  const timestamp = ctx.message.date; // Unix timestamp (giây)

  // Chuyển Unix timestamp sang đối tượng Date
  const messageDate = new Date(timestamp * 1000); // Nhân với 1000 để chuyển sang ms

  const userJira = text.split(" ")[1] || User[userKey];

  if (text === "/test") {
    await ctx.reply("Đây là tin nhắn từ bot demo!");
    return;
  }

  // Định dạng ngày theo kiểu YYYY-MM-DD
  const formattedDate =
    validateDateFormat(text) || messageDate.toISOString().split("T")[0]; // Lấy phần ngày trước 'T'
  const data = await exportWorklogsToSheet(userJira, 0, formattedDate);
  if (!data) {
    await ctx.reply("Không có dữ liệu để báo cáo.");
    return;
  }
  const result = generateTelegramMessage(data ?? [], formattedDate);
  if (text === "Chào bạn 👋") {
    await ctx.reply(`Xin chào ${User[userKey]} ! 😊`);
    await ctx.reply(result);
  } else if (text === "Báo cáo 📄") {
    await ctx.reply(result);
  } else if (text === "Thoát ❌") {
    await ctx.reply("Hẹn gặp lại bạn!");
    await ctx.reply(result);
  } else {
    await ctx.reply("Bạn vừa gửi: " + text);
    await ctx.reply(result);
  }
});

export const POST = webhookCallback(bot, "std/http");
