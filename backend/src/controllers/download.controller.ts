import { Request, Response } from 'express';
import archiver from 'archiver';
import { CapturedImage } from '../models/capturedImage.model';
import path from 'path';
import fs from 'fs';

export const downloadPhotosZip = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    console.log('📦 ZIP download request for session:', sessionId);
    
    // Extract timeFolder from sessionId (everything after the timestamp)
    // sessionId format: "1737871277000-12-01-17_25-01-2026"
    const dashIndex = sessionId.indexOf('-');
    const timeFolder = sessionId.substring(dashIndex + 1); // "12-01-17_25-01-2026"
    const correctedTimeFolder = timeFolder.replace(/^(\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3'); // "12:01:17_25-01-2026"
    
    console.log('📁 Session folder:', correctedTimeFolder);
    
    // Path to the session folder (go up one level from backend to root)
    const sessionFolderPath = path.join(process.cwd(), '..', 'photos', correctedTimeFolder);
    
    console.log('📂 Looking for folder:', sessionFolderPath);
    
    // Create ZIP filename
    const zipName = `${correctedTimeFolder}.zip`;
    console.log('📦 Creating ZIP file:', zipName);

    // Set response headers
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    // Create archive
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err: any) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create ZIP file' });
    });

    // Pipe archive to response
    archive.pipe(res);
    
    // Check if local folder exists (fallback storage)
    if (fs.existsSync(sessionFolderPath)) {
      console.log('✅ Local session folder found (fallback storage), using local files');
      // Add entire session folder to archive
      archive.directory(sessionFolderPath, false);
      console.log('✅ Added entire local session folder to ZIP');
    } else {
      console.log('📁 Local folder not found, checking S3 (primary storage)...');
      
      // Try to get images from database for this session
      const parts = sessionId.split('-');
      const timestamp = parseInt(parts[0]);
      const startTime = new Date(timestamp - 2 * 60 * 1000);
      const endTime = new Date(timestamp + 2 * 60 * 1000);
      
      const images = await CapturedImage.find({
        timestamp: { $gte: startTime, $lte: endTime }
      }).sort({ timestamp: 1 });
      
      console.log(`📸 Found ${images.length} images in database`);
      
      if (images.length === 0) {
        console.log('❌ No photos found for session in database');
        return res.status(404).json({ error: 'No photos found for this session' });
      }
      
      // Download from S3 (primary storage) and add to archive
      let s3FilesAdded = 0;
      for (const image of images) {
        try {
          if (image.storageType === 's3' && image.s3Url) {
            console.log('📥 Downloading from S3:', image.s3Url);
            const response = await fetch(image.s3Url);
            if (response.ok) {
              const buffer = Buffer.from(await response.arrayBuffer());
              const fileName = `${image.cameraLabel}_${new Date(image.timestamp).toISOString().replace(/[:.]/g, '-')}.jpg`;
              archive.append(buffer, { name: fileName });
              s3FilesAdded++;
              console.log('✅ Added S3 file to ZIP:', fileName);
            } else {
              console.log('❌ Failed to download S3 file:', image.s3Url);
            }
          } else {
            console.log('⚠️ Image not stored in S3:', image.imageId);
          }
        } catch (error) {
          console.error(`❌ Error downloading S3 image ${image.imageId}:`, error);
        }
      }
      
      if (s3FilesAdded === 0) {
        console.log('❌ No S3 files could be downloaded');
        return res.status(404).json({ error: 'No photos could be downloaded from storage' });
      }
      
      console.log(`✅ Added ${s3FilesAdded} S3 files to ZIP`);
    }

    // Finalize archive
    await archive.finalize();
    
  } catch (error) {
    console.error('Error creating ZIP download:', error);
    res.status(500).json({ error: 'Failed to create ZIP download' });
  }
};
