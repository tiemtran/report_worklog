export const dynamic = "force-dynamic";

// export const fetchCache = "force-no-store";

import { User } from "@/consts";
import { exportWorklogsToSheet, generateTelegramMessage } from "@/services";
import { Bot, webhookCallback, Keyboard } from "grammy";
// import { Menu } from '@grammyjs/menu';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token)
  throw new Error("TELEGRAM_BOT_TOKEN environment variable not found.");

const bot = new Bot(token);

// // Tạo menu
// const mainMenu = new Menu('main-menu')
//   .text('Chào bạn 👋', (ctx) => ctx.reply('Xin chào!'))
//   .row() // Xuống dòng
//   .text('Thông tin 📄', (ctx) => ctx.reply('Đây là bot demo của bạn!'))
//   .row()
//   .text('Thoát ❌', (ctx) => ctx.reply('Hẹn gặp lại bạn!'));

// // Kết nối menu với bot
// bot.use(mainMenu);

// // Lệnh hiển thị menu
// bot.command('menu', async (ctx) => {
//   await ctx.reply('Chọn một hành động:', {
//     reply_markup: mainMenu,
//   });
// });

// Tạo Custom Keyboard
const customKeyboard = new Keyboard()
  .text("Chào bạn 👋") // Nút 1
  .text("Báo cáo 📄") // Nút 2
  .row() // Xuống dòng
  .text("Thoát ❌"); // Nút 3

// Lệnh hiển thị menu
bot.command("menu", async (ctx) => {
  await ctx.reply("Chọn một hành động:", {
    reply_markup: {
      keyboard: customKeyboard.build(), // Thêm Custom Keyboard
      resize_keyboard: true, // Tự động thay đổi kích thước
      one_time_keyboard: false, // Không ẩn sau khi nhấn
    },
  });
});

// Xử lý tin nhắn khi người dùng nhấn nút
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  const user = ctx.message.from;

  // Kiểm tra và lấy username hoặc tên đầy đủ
  if (!user) {
    await ctx.reply("Không thể xác định người dùng.");
    return;
  }

  const username = user.username ?? "demo";
  const userKey = username as keyof typeof User;

  if (!User[userKey]) {
    await ctx.reply(`Không tìm thấy thông tin cho người dùng: ${username}`);
    return;
  }

  const timestamp = ctx.message.date; // Unix timestamp (giây)

  // Chuyển Unix timestamp sang đối tượng Date
  const messageDate = new Date(timestamp * 1000); // Nhân với 1000 để chuyển sang ms

  // Định dạng ngày theo kiểu YYYY-MM-DD
  const formattedDate = messageDate.toISOString().split("T")[0]; // Lấy phần ngày trước 'T'
  const data = await exportWorklogsToSheet(User[userKey], 0, formattedDate);
  if (!data) {
    await ctx.reply("Không có dữ liệu để báo cáo.");
    return;
  }
  const result = generateTelegramMessage(data ?? []);
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
  }
});

export const POST = webhookCallback(bot, "std/http");
