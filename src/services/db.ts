import { createClient } from "@libsql/client";

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL ?? '',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function saveToTurso(userId: number, username: string | null) {
  try {
    await turso.execute({
      sql: `
          INSERT INTO users (id, username) 
          VALUES (?, ?) 
          ON CONFLICT(id) DO UPDATE SET username = excluded.username
        `,
      args: [userId, username],
    });
    console.log("Lưu vào Turso thành công!");
  } catch (error) {
    console.error("Lỗi khi lưu vào Turso:", error);
  }
}

export async function getAllUsersFromTurso() {
    try {
      const result = await turso.execute(
        "SELECT id, username FROM users"
      );
      console.log('Danh sách người dùng từ Turso:', result.rows);
      return result.rows;
    } catch (error) {
      console.error('Lỗi khi lấy người dùng từ Turso:', error);
      return [];
    }
  }
