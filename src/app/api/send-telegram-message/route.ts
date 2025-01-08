import { getAllUsersFromTurso } from "@/services/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8042"; // URL gốc của ứng dụng
  try {
    // Kiểm tra nếu request có body
    const contentLength = request.headers.get("content-length");
    if (!contentLength || Number(contentLength) === 0) {
      return NextResponse.json(
        { success: false, message: "Missing body" },
        { status: 400 }
      );
    }
    const body = await request.json();
    const textNotification = body?.textNotification ?? "";
    const users = await getAllUsersFromTurso();

    // const users = [
    //   {
    //     id: 849897475,
    //     username: "longledang",
    //   },
    // ];

    // Tách từng user thành các request API riêng
    const requests = users?.map((user) =>
      fetch(`${baseUrl}/api/send-message`, {
        method: "POST",
        body: JSON.stringify({
          textNotification: textNotification,
          user: user,
        }),
      })
    );

    // Gọi các API nhỏ song song
    const results = await Promise.all(requests);

    const success = results.filter((res) => res.ok).length;
    const failed = results.length - success;

    return NextResponse.json({
      success: true,
      message: `Messages sent. Success: ${success}, Failed: ${failed}`,
    });
  } catch (error) {
    console.error("Error sending messages:", error);
    return NextResponse.json({ success: false, error });
  }
}
