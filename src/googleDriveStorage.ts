import { google } from 'googleapis';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';

interface GoogleDriveConfig {
  clientEmail: string;
  privateKey: string;
  folderId?: string; // Optional: specific folder to store recordings
}

class GoogleDriveStorage {
  private drive: any;
  private folderId: string | undefined;

  constructor(config: GoogleDriveConfig) {
    // Initialize Google Drive API with service account
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.clientEmail,
        private_key: config.privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    this.drive = google.drive({ version: 'v3', auth });
    this.folderId = config.folderId;
  }

  /**
   * Upload a recording file to Google Drive
   */
  async uploadRecording(localFilePath: string, filename: string): Promise<string | null> {
    try {
      if (!existsSync(localFilePath)) {
        console.error(`File not found: ${localFilePath}`);
        return null;
      }

      console.log(`📤 Uploading ${filename} to Google Drive...`);

      const fileMetadata = {
        name: filename,
        parents: this.folderId ? [this.folderId] : undefined,
      };

      const media = {
        mimeType: 'audio/wav',
        body: createReadStream(localFilePath),
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, size, createdTime, webViewLink',
      });

      const file = response.data;
      console.log(`✅ Successfully uploaded to Google Drive:`, {
        fileId: file.id,
        name: file.name,
        size: file.size,
        webViewLink: file.webViewLink,
      });

      return file.id;
    } catch (error) {
      console.error('❌ Error uploading to Google Drive:', error);
      return null;
    }
  }

  /**
   * List all recordings in the Google Drive folder
   */
  async listRecordings(): Promise<any[]> {
    try {
      const query = this.folderId 
        ? `'${this.folderId}' in parents and mimeType='audio/wav' and trashed=false`
        : "mimeType='audio/wav' and trashed=false";

      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, size, createdTime, modifiedTime, webViewLink, webContentLink)',
        orderBy: 'createdTime desc',
      });

      return response.data.files || [];
    } catch (error) {
      console.error('❌ Error listing Google Drive recordings:', error);
      return [];
    }
  }

  /**
   * Delete a recording from Google Drive
   */
  async deleteRecording(fileId: string): Promise<boolean> {
    try {
      await this.drive.files.delete({ fileId });
      console.log(`✅ Deleted recording from Google Drive: ${fileId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting recording ${fileId}:`, error);
      return false;
    }
  }

  /**
   * Get download URL for a recording
   */
  async getDownloadUrl(fileId: string): Promise<string | null> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'webContentLink',
      });
      return response.data.webContentLink || null;
    } catch (error) {
      console.error(`❌ Error getting download URL for ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Create a folder for recordings (optional)
   */
  async createRecordingsFolder(folderName: string = 'Pizza Restaurant Recordings'): Promise<string | null> {
    try {
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };

      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id, name, webViewLink',
      });

      const folder = response.data;
      console.log(`✅ Created Google Drive folder:`, {
        folderId: folder.id,
        name: folder.name,
        webViewLink: folder.webViewLink,
      });

      return folder.id;
    } catch (error) {
      console.error('❌ Error creating Google Drive folder:', error);
      return null;
    }
  }

  /**
   * Make a file publicly readable (optional)
   */
  async makePublic(fileId: string): Promise<boolean> {
    try {
      await this.drive.permissions.create({
        fileId,
        resource: {
          role: 'reader',
          type: 'anyone',
        },
      });
      console.log(`✅ Made recording ${fileId} publicly readable`);
      return true;
    } catch (error) {
      console.error(`❌ Error making file ${fileId} public:`, error);
      return false;
    }
  }
}

// Export factory function
export function createGoogleDriveStorage(config: GoogleDriveConfig): GoogleDriveStorage {
  return new GoogleDriveStorage(config);
}

// Export types
export type { GoogleDriveConfig };
export { GoogleDriveStorage };