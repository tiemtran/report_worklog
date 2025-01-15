export const dynamic = "force-dynamic";

export const fetchCache = "force-no-store";

import { User } from "@/consts";
import { exportWorklogsToSheet, formatMessage } from "@/services";
import { saveToTurso } from "@/services/db";
import { checkAndSaveToRedis } from "@/services/redis";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import {
  Bot,
  Context,
  InlineKeyboard,
  Keyboard,
  session,
  webhookCallback,
} from "grammy";
import moment from "moment";

// Định nghĩa kiểu dữ liệu cho session
interface SessionData {
  waitingForDate: boolean;
}

// Tạo type cho context với session
type MyContext = Context & {
  session: SessionData;
};

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token)
  throw new Error("TELEGRAM_BOT_TOKEN environment variable not found.");

const bot = new Bot<MyContext>(token);

bot.api.config.use(apiThrottler());

bot.command("status", (ctx) => {
  // Ignore the message if it's older than 2 seconds
  if (Date.now() / 1000 - ctx.msg.date < 2) {
    ctx.reply("The bot is up.");
  }
});

// Thiết lập session middleware
bot.use(
  session({
    initial: (): SessionData => ({
      waitingForDate: false,
    }),
  })
);

// 1. Commands với mô tả
bot.api.setMyCommands([
  { command: "start", description: "Đăng kí thông tin" },
  { command: "dailyreport", description: "Xem Logwork ngày hiện tại" },
  { command: "report", description: "Xem Logwork option" },
  { command: "help", description: "Xem hướng dẫn" },
  { command: "menu", description: "Các tiện ích khác" },
]);

// 2. Reply Keyboard (thay thế bàn phím người dùng)
bot.command("start", async (ctx) => {
  const user = ctx.from;
  // Kiểm tra và lấy username hoặc tên đầy đủ
  if (!user?.username) {
    await ctx.reply("Không thể xác định người dùng.");
    return;
  }

  const userKey = user.username as keyof typeof User;

  const userJira = User[userKey];

  if (!userJira) {
    await ctx.reply(
      `Thông tin người dùng: ${user.username} chưa được khai báo`
    );
    return;
  }

  // Kiểm tra và lưu vào Redis trước
  const existsInRedis = await checkAndSaveToRedis(user.id, user.username);

  // Nếu chưa tồn tại trong Redis, lưu vào Turso
  if (!existsInRedis) {
    await saveToTurso(user.id, user.username);
    await ctx.reply("Đăng ký thông tin thành công!");
  } else {
    await ctx.reply("Người dùng đã tồn tại trong hệ thống!");
  }
});

bot.command("dailyreport", async (ctx) => {
  const username = ctx.from?.username;
  // Kiểm tra và lấy username hoặc tên đầy đủ
  if (!username) {
    await ctx.reply("Không thể xác định người dùng.");
    return;
  }

  const userKey = username as keyof typeof User;

  const userJira = User[userKey];

  if (!userJira) {
    await ctx.reply(`Thông tin người dùng: ${username} chưa được khai báo`);
    return;
  }

  const data = await exportWorklogsToSheet({
    assignee: userJira,
    filterDate: moment().format("YYYY-MM-DD"),
  });

  if (!data) {
    await ctx.reply("Không có dữ liệu để báo cáo.");
    return;
  }

  if (data.length === 1 && data?.[0]?.status === 401) {
    await ctx.reply("Cookie đã hết hạn, vui lòng thử lại sau.");
    return;
  }

  const result = formatMessage(data ?? [], userJira);
  await ctx.reply(result, {
    parse_mode: "MarkdownV2",
  });
});

bot.command("menu", async (ctx) => {
  const keyboard = new Keyboard()
    .text("🍕 Pizza")
    .text("🍜 Mì")
    .row()
    .text("🍣 Sushi")
    .text("🍔 Hamburger")
    .row()
    .text("❌ Đóng menu")
    .resized(); // Làm cho nút vừa với text

  await ctx.reply("Chọn món ăn:", {
    reply_markup: keyboard,
  });
});

bot.command("test", async (ctx) => {
  const messageText = ctx.message?.text || "";
  const args = messageText.split(" ").slice(1); // Tách phần sau "/test"

  // Kiểm tra nếu không có đủ tham số hoặc tham số không hợp lệ
  if (args.length === 0 || args.length > 1) {
    await ctx.reply("Vui lòng nhập đúng định dạng: /test <usernameJira>");
    return;
  }

  const commandArg = args[0].toLowerCase();
  const isCheckUser = Object.values(User).includes(commandArg);
  if (!isCheckUser) {
    await ctx.reply(`User không hợp lệ: ${commandArg}`);
    return;
  }
  const data = await exportWorklogsToSheet({
    assignee: commandArg,
    filterDate: moment().format("YYYY-MM-DD"),
  });

  if (!data) {
    await ctx.reply("Không có dữ liệu để báo cáo.");
    return;
  }

  if (data.length === 1 && data?.[0]?.status === 401) {
    await ctx.reply("Cookie đã hết hạn, vui lòng thử lại sau.");
    return;
  }

  const result = formatMessage(data ?? [], commandArg);
  await ctx.reply(result, {
    parse_mode: "MarkdownV2",
  });
});

bot.command("help", async (ctx) => {
  // Trong MarkdownV2, các ký tự đặc biệt cần được escape:
  // _ * [ ] ( ) ~ ` > # + - = | { } . !
  const helpMessage = `
*Hướng dẫn sử dụng bot*

*1\\. Các lệnh cơ bản:*
• /start \\- Đăng kí thông tin
• /dailyreport \\- Xem Logwork ngày hôm nay
• /report \\- Xem Logwork với các option
• /menu \\- Xem menu chính
• /book \\- Đặt lịch hẹn (Comming soon...)
• /help \\- Xem hướng dẫn này

*2\\. Cách sử dụng:*
• Nhấn vào các nút để tương tác
• Gửi tin nhắn để chat với bot
• Sử dụng menu để điều hướng

*3\\. Định dạng văn bản:*
• _In nghiêng_ \\- Quan trọng
• *In đậm* \\- Rất quan trọng
• ||Văn bản ẩn|| \\- Bí mật
• \`Code\` \\- Mã lệnh

_Liên hệ nhà phát triển: @longledang_`;

  await ctx.reply(helpMessage, {
    parse_mode: "MarkdownV2",
  });
});

// Xử lý khi người dùng nhấn nút trên reply keyboard
bot.hears("❌ Đóng menu", async (ctx) => {
  await ctx.reply("Đã đóng menu", {
    reply_markup: { remove_keyboard: true },
  });
});

// 3. Inline Keyboard (nút bên dưới tin nhắn)
bot.command("report", async (ctx) => {
  const inlineKeyboard = new InlineKeyboard()
    .row()
    .text("Ngày hôm nay", "today_report")
    .row()
    .text("Ngày hôm qua", "yesterday_report")
    .row()
    .text("Tuần hiện tại", "current_week_report")
    .row()
    .text("Tháng hiện tại", "current_month_report")
    .row()
    .text("Nhập ngày cụ thể", "specific_date");

  await ctx.reply("Chọn thời gian muốn xem Logwork?", {
    reply_markup: inlineKeyboard,
  });
});

// Xử lý callback khi người dùng nhấn nút inline

bot.callbackQuery("today_report", async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Đã xác nhận chọn ngày hôm nay!",
  });

  const username = ctx.from?.username;
  // Kiểm tra và lấy username hoặc tên đầy đủ
  if (!username) {
    await ctx.reply("Không thể xác định người dùng.");
    return;
  }

  const userKey = username as keyof typeof User;

  const userJira = User[userKey];

  if (!userJira) {
    await ctx.reply(`Thông tin người dùng: ${username} chưa được khai báo`);
    return;
  }

  const data = await exportWorklogsToSheet({
    assignee: userJira,
  });

  if (!data) {
    await ctx.reply("Không có dữ liệu để báo cáo.");
    return;
  }

  if (data.length === 1 && data?.[0]?.status === 401) {
    await ctx.reply("Cookie đã hết hạn, vui lòng thử lại sau.");
    return;
  }

  const result = formatMessage(data ?? [], userJira);
  await ctx.reply(result, {
    parse_mode: "MarkdownV2",
  });
});

bot.callbackQuery("yesterday_report", async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Đã xác nhận chọn ngày hôm qua!",
  });

  const username = ctx.from?.username;
  // Kiểm tra và lấy username hoặc tên đầy đủ
  if (!username) {
    await ctx.reply("Không thể xác định người dùng.");
    return;
  }

  const userKey = username as keyof typeof User;

  const userJira = User[userKey];

  if (!userJira) {
    await ctx.reply(`Thông tin người dùng: ${username} chưa được khai báo`);
    return;
  }

  const data = await exportWorklogsToSheet({
    assignee: userJira,
    isToday: false,
    isYesterday: true,
  });

  if (!data) {
    await ctx.reply("Không có dữ liệu để báo cáo.");
    return;
  }

  if (data.length === 1 && data?.[0]?.status === 401) {
    await ctx.reply("Cookie đã hết hạn, vui lòng thử lại sau.");
    return;
  }

  const result = formatMessage(data ?? [], userJira);
  await ctx.reply(result, {
    parse_mode: "MarkdownV2",
  });
});

bot.callbackQuery("current_week_report", async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Đã xác nhận chọn tuần hiện tại!",
  });
  const username = ctx.from?.username;
  // Kiểm tra và lấy username hoặc tên đầy đủ
  if (!username) {
    await ctx.reply("Không thể xác định người dùng.");
    return;
  }

  const userKey = username as keyof typeof User;

  const userJira = User[userKey];

  if (!userJira) {
    await ctx.reply(`Thông tin người dùng: ${username} chưa được khai báo`);
    return;
  }

  const data = await exportWorklogsToSheet({
    assignee: userJira,
    isToday: false,
    isCurrentWeek: true,
  });

  if (!data) {
    await ctx.reply("Không có dữ liệu để báo cáo.");
    return;
  }

  if (data.length === 1 && data?.[0]?.status === 401) {
    await ctx.reply("Cookie đã hết hạn, vui lòng thử lại sau.");
    return;
  }

  const result = formatMessage(data ?? [], userJira);
  await ctx.reply(result, {
    parse_mode: "MarkdownV2",
  });
});

bot.callbackQuery("current_month_report", async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Đã xác nhận chọn tháng hiện tại!",
  });
  const username = ctx.from?.username;
  // Kiểm tra và lấy username hoặc tên đầy đủ
  if (!username) {
    await ctx.reply("Không thể xác định người dùng.");
    return;
  }

  const userKey = username as keyof typeof User;

  const userJira = User[userKey];

  if (!userJira) {
    await ctx.reply(`Thông tin người dùng: ${username} chưa được khai báo`);
    return;
  }

  const data = await exportWorklogsToSheet({
    assignee: userJira,
    isToday: false,
    isCurrentMonth: true,
  });

  if (!data) {
    await ctx.reply("Không có dữ liệu để báo cáo.");
    return;
  }

  if (data.length === 1 && data?.[0]?.status === 401) {
    await ctx.reply("Cookie đã hết hạn, vui lòng thử lại sau.");
    return;
  }

  const result = formatMessage(data ?? [], userJira);
  await ctx.reply(result, {
    parse_mode: "MarkdownV2",
  });
});

// Xử lý khi người dùng nhấn nút "Nhập ngày cụ thể"
bot.callbackQuery("specific_date", async (ctx) => {
  ctx.session.waitingForDate = true;
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Vui lòng nhập ngày theo định dạng YYYY-MM-DD\nVí dụ: 2025-01-06"
  );
});

// Xử lý tin nhắn văn bản khi đang chờ nhập ngày
bot.on("message:text", async (ctx) => {
  if (ctx.session.waitingForDate) {
    const dateStr = ctx.message.text;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    if (dateRegex.test(dateStr)) {
      const date = new Date(dateStr);

      // Kiểm tra ngày hợp lệ
      if (!isNaN(date.getTime())) {
        ctx.session.waitingForDate = false;
        // Xử lý logic xem logwork cho ngày cụ thể
        const username = ctx.from?.username;
        // Kiểm tra và lấy username hoặc tên đầy đủ
        if (!username) {
          await ctx.reply("Không thể xác định người dùng.");
          return;
        }

        const userKey = username as keyof typeof User;

        const userJira = User[userKey];

        if (!userJira) {
          await ctx.reply(
            `Thông tin người dùng: ${username} chưa được khai báo`
          );
          return;
        }

        const data = await exportWorklogsToSheet({
          assignee: userJira,
          isToday: false,
          dayCustom: dateStr,
          filterDate: dateStr,
        });

        if (!data) {
          await ctx.reply("Không có dữ liệu để báo cáo.");
          return;
        }

        if (data.length === 1 && data?.[0]?.status === 401) {
          await ctx.reply("Cookie đã hết hạn, vui lòng thử lại sau.");
          return;
        }

        const result = formatMessage(data ?? [], userJira);
        await ctx.reply(result, {
          parse_mode: "MarkdownV2",
        });
      } else {
        await ctx.reply(
          "Ngày không hợp lệ. Vui lòng nhập lại theo định dạng YYYY-MM-DD"
        );
      }
    } else {
      await ctx.reply(
        "Định dạng không đúng. Vui lòng nhập theo định dạng YYYY-MM-DD"
      );
    }
  }
});

// Xử lý tin nhắn khi người dùng nhấn nút
// bot.on("message:text", async (ctx) => {
//   const text = ctx.message.text;
//   const user = ctx.message.from;
// });

export const POST = webhookCallback(bot, "std/http");
