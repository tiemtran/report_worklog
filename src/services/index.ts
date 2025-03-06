/* eslint-disable */

import axios from "axios";
import * as https from "https";
import moment from "moment";

const agent = new https.Agent({
  rejectUnauthorized: false,
});

const headers = {
  // Cookie: process.env.COOKIE,
  'Authorization': `Basic ${process.env.AUTHORIZATION}`, //Đang dùng user:pass encode base64, có thể bị decode lại lộ thông tin
  "Content-Type": "application/json",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
  "cache-control": "no-cache",
  pragma: "no-cache",
  "sec-ch-ua":
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
};

export async function exportWorklogsToSheet({
  assignee,
  filterDate = "",
  isToday = true,
  isYesterday = false,
  isCurrentWeek = false,
  isCurrentMonth = false,
  dayCustom = "",
}: {
  assignee: string;
  filterDate?: string;
  isToday?: boolean;
  isYesterday?: boolean;
  isCurrentWeek?: boolean;
  isCurrentMonth?: boolean;
  dayCustom?: string;
}) {
  const jiraUrl = process.env.END_POINT;

  // const startDate = getStartOfWeek(indexWeek);
  // const endDate = getEndOfWeek(indexWeek);
  // const dateRange = generateDateRange(startDate, endDate);

  // Hôm nay
  const today = {
    startDate: moment().startOf("day").format("YYYY-MM-DD"),
    endDate: moment().endOf("day").format("YYYY-MM-DD"),
  };

  // Hôm qua
  const yesterday = {
    startDate: moment().subtract(1, "days").startOf("day").format("YYYY-MM-DD"),
    endDate: moment().subtract(1, "days").endOf("day").format("YYYY-MM-DD"),
  };

  // Tuần này
  const thisWeek = {
    startDate: moment().startOf("week").format("YYYY-MM-DD"),
    endDate: moment().endOf("week").format("YYYY-MM-DD"),
  };

  // Tháng này
  const thisMonth = {
    startDate: moment().startOf("month").format("YYYY-MM-DD"),
    endDate: moment().endOf("month").format("YYYY-MM-DD"),
  };

  // dayCustom
  const thisDayCustom = {
    startDate: moment(dayCustom).startOf("day").format("YYYY-MM-DD"),
    endDate: moment(dayCustom).endOf("day").format("YYYY-MM-DD"),
  };

  // const startDate = isToday
  //   ? today.startDate
  //   : isYesterday
  //   ? yesterday.startDate
  //   : isCurrentWeek
  //   ? thisWeek.startDate
  //   : isCurrentMonth
  //   ? thisMonth.startDate
  //   : thisWeek.startDate;

  const startDate = isToday
    ? today.startDate
    : isYesterday
      ? yesterday.startDate
      : isCurrentWeek
        ? thisWeek.startDate
        : isCurrentMonth
          ? thisMonth.startDate
          : thisDayCustom.startDate;

  const endDate = isToday
    ? today.endDate
    : isYesterday
      ? yesterday.endDate
      : isCurrentWeek
        ? thisWeek.endDate
        : isCurrentMonth
          ? thisMonth.endDate
          : thisDayCustom.endDate;

  const dateRange = generateDateRange(startDate, endDate);

  const params = {
    jql: `worklogAuthor = ${assignee} AND worklogDate >= ${startDate} AND worklogDate <= ${endDate}`,
    fields: "key,summary,timeoriginalestimate,timespent",
  };

  try {
    const issues = (await callJiraApi({
      url: jiraUrl + "/rest/api/2/search",
      params,
    })) as any;
    if (issues?.length && issues?.[0]?.status === 401) {
      return issues;
    }
    const allWorklogs = await processWorklogs(
      issues.issues,
      assignee,
      dateRange,
      jiraUrl ?? ""
    );
    return filterDataByDate(allWorklogs, filterDate);
  } catch (error) {
    console.log("Lỗi khi lấy dữ liệu từ Jira: " + error);
  }
}

async function callJiraApi(search: {
  url: string;
  params?: { jql: string; fields: string };
}) {
  let data: any[] = [];
  await axios
    .get(search.url, {
      params: search?.params || {},
      headers: headers,
      httpsAgent: agent,
    })
    .then((response) => {
      data = response.data;
    })
    .catch((error) => {
      console.error("error:::::", error);
      data = [
        {
          status: error.response.status,
          message: error.response.code,
        },
      ];
    });
  return data;
}

async function processWorklogs(
  issues: any[],
  assignee: string,
  dateRange: string[],
  jiraUrl: string
) {
  const allWorklogs: any[] = [];

  const promises = issues.map(async (issue) => {
    const issueKey = issue.key;
    const issueSummary = issue.fields.summary;
    const originalestimate = convertSecondToHours(
      issue.fields.timeoriginalestimate
    );
    const timespent = convertSecondToHours(issue.fields.timespent);
    const worklogUrl = `${jiraUrl}/rest/api/2/issue/${issueKey}/worklog`;

    try {
      const worklogs = (await callJiraApi({
        url: worklogUrl,
      })) as any;
      worklogs?.worklogs
        .filter((log: any) => log.author.name === assignee)
        .forEach((log: any) => {
          const logDate = log.started.split("T")[0];
          if (dateRange.includes(logDate)) {
            let issueData = allWorklogs.find(
              (item) => item.IssueKey === issueKey
            );
            if (!issueData) {
              issueData = {
                IssueKey: issueKey,
                Summary: issueSummary,
                OriginalEstimate: originalestimate,
                Timespent: timespent,
                ...initializeDateColumns(dateRange),
              };
              allWorklogs.push(issueData);
            }
            issueData[logDate] = (
              parseFloat(issueData[logDate] || 0) +
              parseFloat(convertTimeSpentToHours(log.timeSpent))
            ).toFixed(1);
          }
        });
    } catch (error) {
      console.log(`Lỗi khi lấy worklog cho issue ${issueKey}: ` + error);
    }
  });

  await Promise.all(promises);
  return allWorklogs;
}

const convertTimeSpentToHours = (timeSpent: any) => {
  let totalHours = 0;
  const daysMatch = timeSpent.match(/(\d+)d/);
  const hoursMatch = timeSpent.match(/(\d+)h/);
  const minutesMatch = timeSpent.match(/(\d+)m/);
  const definedHourInADay = 7; // 1 ngày = 7 giờ
  if (daysMatch) {
    totalHours += parseInt(daysMatch[1], 10) * definedHourInADay;
  }
  if (hoursMatch) {
    totalHours += parseInt(hoursMatch[1], 10);
  }
  if (minutesMatch) {
    totalHours += parseInt(minutesMatch[1], 10) / 60;
  }

  return totalHours.toFixed(1);
};
function convertSecondToHours(timeSpent: any) {
  let totalHours = timeSpent / 3600; // Convert seconds to hours
  return totalHours.toFixed(1); // Return the result with 1 decimal places
}

function getStartOfWeek(indexWeek: number) {
  const today = new Date();
  const firstDay = today.getDate() - today.getDay() + 1 - indexWeek * 7;
  return new Date(today.setDate(firstDay));
}

function getEndOfWeek(indexWeek: number) {
  const start = getStartOfWeek(indexWeek);
  return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
}

// function generateDateRange(startDate: Date, endDate: Date) {
//   const dates = [];
//   let currentDate = new Date(startDate);
//   while (currentDate <= endDate) {
//     dates.push(formatDate(currentDate));
//     currentDate.setDate(currentDate.getDate() + 1);
//   }
//   return dates;
// }

/**
 * Hàm tạo danh sách các ngày giữa startDate và endDate
 * @param {string} startDate - Ngày bắt đầu (định dạng YYYY-MM-DD)
 * @param {string} endDate - Ngày kết thúc (định dạng YYYY-MM-DD)
 * @returns {string[]} - Mảng chứa các ngày (định dạng YYYY-MM-DD)
 */
function generateDateRange(startDate: string, endDate: string) {
  const start = moment(startDate, "YYYY-MM-DD");
  const end = moment(endDate, "YYYY-MM-DD");

  // Kiểm tra nếu startDate lớn hơn endDate
  if (start.isAfter(end)) {
    throw new Error("startDate must be before or equal to endDate");
  }

  const dateRange = [];
  let currentDate = start.clone();

  while (currentDate.isSameOrBefore(end)) {
    dateRange.push(currentDate.format("YYYY-MM-DD"));
    currentDate.add(1, "days");
  }

  return dateRange;
}

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function initializeDateColumns(dateRange: any) {
  return dateRange.reduce(
    (acc: any, date: any) => ({ ...acc, [date]: "" }),
    {}
  );
}

export function generateTelegramMessage(data: any[], formattedDate: string) {
  if (!data || data.length === 0) {
    return `Không có dữ liệu để hiển thị ngày ${formattedDate}`;
  }
  // Tìm tất cả các ngày có trong dữ liệu
  const allDates = Object.keys(data[0]).filter((key) =>
    /^\d{4}-\d{2}-\d{2}$/.test(key)
  );

  let message = "🚀 *Tiến độ công việc mới nhất:*\n";

  // Duyệt qua từng ngày
  allDates.forEach((date) => {
    // Lọc ra các công việc đã hoàn thành trong ngày đó
    const tasksForDate = data.filter((task) => task[date]);

    if (tasksForDate.length > 0) {
      message += `🔥 Ngày *${date}*:\n`;

      tasksForDate.forEach((task) => {
        message += `- *${task.IssueKey}*: \`${task.Summary}\` (${task[date]} giờ hoàn thành ✅)\n`;
      });
    }
  });

  // Tính tổng thời gian đã hoàn thành
  const totalHours = data.reduce((sum, task) => {
    return (
      sum +
      allDates.reduce((daySum, date) => {
        return daySum + (parseFloat(task[date]) || 0);
      }, 0)
    );
  }, 0);

  message += `\n**Tổng thời gian đã hoàn thành:** ${totalHours.toFixed(
    1
  )} giờ.\n`;
  message += "💪 *Mọi thứ đang đi đúng tiến độ, hãy tiếp tục duy trì nhé!*";

  return message;
}

export function validateDateFormat(message: string): string {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return dateRegex.test(message) ? message : "";
}

function filterDataByDate(data: any[], date: string) {
  return data
    .filter((item) => {
      if (date) {
        // Nếu có date, lọc các mục có giá trị tại ngày đó
        return !!item[date];
      } else {
        // Nếu không có date, lọc các mục có bất kỳ ngày nào có giá trị
        return Object.keys(item).some(
          (key) => key.match(/^\d{4}-\d{2}-\d{2}$/) && !!item[key]
        );
      }
    })
    .map((item) => {
      if (date) {
        // Nếu có date, chỉ trả về giá trị tại ngày đó
        return {
          IssueKey: item.IssueKey,
          Summary: item.Summary,
          [date]: item[date],
        };
      } else {
        // Nếu không có date, trả về tất cả các ngày có giá trị
        const filteredDates = Object.keys(item)
          .filter((key) => key.match(/^\d{4}-\d{2}-\d{2}$/) && !!item[key])
          .reduce((acc: any, key) => {
            acc[key] = item[key];
            return acc;
          }, {});

        return {
          IssueKey: item.IssueKey,
          Summary: item.Summary,
          ...filteredDates,
        };
      }
    });
}

const escapeMarkdownV2 = (text: string) => {
  // Escape tất cả ký tự đặc biệt cho MarkdownV2
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
};

export const formatMessage = (data: any[], userJira?: string) => {
  if (!data || data.length === 0) {
    return `Không có dữ liệu để hiển thị`;
  }

  const allDates = Array.from(
    new Set(
      data.flatMap((item) =>
        Object.keys(item).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
      )
    )
  );

  let message = `📊 *Báo Cáo Công Việc ${userJira ?? ""}*\n\n`;

  allDates.sort().forEach((date) => {
    const tasksForDate = data.filter((item) => item[date]);
    // Escape date string
    const escapedDate = date.replace(/-/g, "\\-");
    message += `📅 *${escapedDate}*\n\n`;

    let dailyTotal = 0;
    tasksForDate.forEach((item) => {
      const hours = parseFloat(item[date]);
      if (!isNaN(hours)) {
        dailyTotal += hours;

        const issueKey = escapeMarkdownV2(item.IssueKey ?? "N/A");
        // const link = issueKey ? escapeMarkdownV2(`https://im.awing.vn/browse/${issueKey}`) : "";
        const baseUrl = "https://im\\.awing\\.vn/browse/";
        const link = `${baseUrl}${issueKey}`;
        const summary = escapeMarkdownV2(item.Summary ?? "Không có mô tả");

        if (link) {
          message += `🔹 [${issueKey}](${link}) \\- ${summary}\n`;
        } else {
          message += `🔹 ${issueKey} \\- ${summary}\n`;
        }
        message += `   ⏱ ${hours.toFixed(1).replace(".", "\\.")} giờ\n\n`;
      }
    });

    message += `📌 *Tổng trong ngày: ${dailyTotal
      .toFixed(1)
      .replace(".", "\\.")} giờ*\n\n`;
  });

  const grandTotal = allDates.reduce((total, date) => {
    return (
      total +
      data.reduce((sum, item) => {
        const hours = item[date] ? parseFloat(item[date]) : 0;
        return sum + (isNaN(hours) ? 0 : hours);
      }, 0)
    );
  }, 0);

  message += `💪 *Tổng thời gian: ${grandTotal
    .toFixed(1)
    .replace(".", "\\.")} giờ*`;
  return message;
};

// function exportToSheet(allWorklogs, dateRange, sheetName) {
//   const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
//   let sheet = spreadsheet.getSheetByName(sheetName);
//   if (!sheet) {
//     sheet = spreadsheet.insertSheet(sheetName);
//   } else {
//     sheet.clear(); // Xóa nội dung cũ
//   }

//   // Tiêu đề cột
//   const header = [
//     "IssueKey",
//     "Summary",
//     "Original Estimate",
//     "Time Spent",
//     ...dateRange,
//   ];
//   sheet.appendRow(header);
//   // Set header to bold
//   const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn()); // Range for the header row
//   headerRange.setFontWeight("bold"); // Apply bold font weight to the header

//   // Thêm dữ liệu worklogs
//   allWorklogs.forEach((issueData, rowIndex) => {
//     const tmpOriginalEstimate =
//       issueData.OriginalEstimate != "0.0" ? issueData.OriginalEstimate : "";
//     const tmpTimespent =
//       issueData.Timespent != "0.0" ? issueData.Timespent : "";
//     const row = [
//       issueData.IssueKey,
//       issueData.Summary,
//       tmpOriginalEstimate,
//       tmpTimespent,
//       ...dateRange.map((date) => issueData[date] || ""),
//     ];
//     sheet.appendRow(row);
//     // Thêm link vào cột IssueKey
//     const issueKeyCell = sheet.getRange(rowIndex + 2, 1); // Hàng +2 vì tiêu đề nằm ở hàng 1
//     const issueLink = `https://im.awing.vn/browse/${issueData.IssueKey}`;
//     issueKeyCell.setValue(
//       `=HYPERLINK("${issueLink}", "${issueData.IssueKey}")`
//     );
//   });

//   // Tổng cộng theo ngày
//   const totalRow = dateRange.map((date) => {
//     return allWorklogs
//       .reduce((sum, item) => sum + parseFloat(item[date] || 0), 0)
//       .toFixed(1);
//   });
//   sheet.appendRow(["Total", "", "", "", ...totalRow]);

//   formatSheet(sheet, dateRange);
// }
// function formatSheet(sheet, dateRange) {
//   // Định dạng bảng
//   const range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
//   range.setHorizontalAlignment("left"); // Căn giữa dữ liệu
//   range.setVerticalAlignment("middle"); // Căn giữa theo chiều dọc
//   range.setWrap(true); // Đảm bảo dữ liệu được wrap trong ô

//   // Tự động điều chỉnh kích thước cột
//   sheet.autoResizeColumns(1, sheet.getLastColumn());

//   // Định dạng các cột số (bắt đầu từ cột thứ 3)
//   const numberRange = sheet.getRange(
//     2,
//     3,
//     sheet.getLastRow() - 1,
//     dateRange.length
//   );
//   numberRange.setNumberFormat("0.0"); // Định dạng 1 chữ số thập phân

//   // Đặt chiều rộng tối thiểu cho các cột
//   const minWidths = [100, 700, 120, 120]; // Minimum widths for IssueKey, Summary, Original Estimate, and Timespent columns
//   for (let i = 0; i < minWidths.length; i++) {
//     sheet.setColumnWidth(i + 1, minWidths[i]);
//   }

//   // Set minimum width for date columns (starting from the 5th column)
//   dateRange.forEach((_, index) => {
//     sheet.setColumnWidth(5 + index, 80); // Adjust the 80 to the desired minimum width
//     sheet
//       .getRange(2, 5 + index, sheet.getLastRow() - 1, 1)
//       .setHorizontalAlignment("right"); // Căn phải cho các cột số sau (từ cột 5 trở đi là các cột ngày)
//   });
//   // Căn phải cho cột "Original Estimate" và "Timespent" (cột thứ 3 và thứ 4)
//   sheet
//     .getRange(2, 3, sheet.getLastRow() - 1, 1)
//     .setHorizontalAlignment("right"); // Original Estimate column
//   sheet
//     .getRange(2, 4, sheet.getLastRow() - 1, 1)
//     .setHorizontalAlignment("right"); // Timespent column
// }
