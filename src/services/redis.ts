// import { Redis } from '@upstash/redis';

// const redis = new Redis({
//   url: process.env.UPSTASH_REDIS_REST_URL,
//   token: process.env.UPSTASH_REDIS_REST_TOKEN,
// });

// export async function checkAndSaveToRedis(userId: number, username: string | null): Promise<boolean> {
//   try {
//     const exists = await redis.exists(`user:${userId}`);
//     if (exists) {
//       console.log('Thông tin người dùng đã tồn tại trong Redis, không cần lưu vào Turso.');
//       return true; // Đã tồn tại
//     }

//     // Lưu vào Redis với TTL (24 giờ)
//     await redis.hset(`user:${userId}`, { username, timestamp: Date.now() });
//     await redis.expire(`user:${userId}`, 86400); // 24 giờ (TTL)
//     console.log('Lưu thông tin vào Redis thành công!');
//     return false; // Chưa tồn tại
//   } catch (error) {
//     console.error('Lỗi khi kiểm tra hoặc lưu vào Redis:', error);
//     return false; // Xử lý lỗi mặc định là chưa tồn tại
//   }
// }