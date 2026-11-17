import { cloudinary } from '../config/cloudinary';
import { db } from '../drizzle/db';
import { users } from '../drizzle/schema/users';
import { eq } from 'drizzle-orm';

export class AvatarService {
  /**
   * Uploads an image buffer to Cloudinary, updates the user's avatar URL,
   * and deletes the previous image if one existed.
   */
  static async updateAvatar(userId: string, fileBuffer: Buffer, mimetype: string) {
    // 1. Find the current user to get the old public ID
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { avatarUrl: true },
    });
    if (!user) throw new Error('User not found');

    // 2. Upload the new image to Cloudinary using a stream
    const uploadResult = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'banana-game/avatars',
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(fileBuffer);
    });

    // 3. Update the database with the new URL and public ID
    const [updatedUser] = await db
      .update(users)
      .set({
        avatarUrl: uploadResult.secure_url,
        // cloudinaryPublicId: uploadResult.public_id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ avatarUrl: users.avatarUrl });

    // 4. If an old image exists, delete it from Cloudinary (best effort)
    if (user.avatarUrl) {
      try {
        await cloudinary.uploader.destroy(user.avatarUrl, {
          invalidate: true, // Purge CDN cache for the old image
        });
      } catch (err) {
        console.error('[avatar] Failed to delete old Cloudinary image:', err);
      }
    }

    return { avatarUrl: updatedUser.avatarUrl };
  }
}