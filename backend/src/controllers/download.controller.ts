import { Request, Response } from 'express';
import archiver from 'archiver';
import { CapturedImage } from '../models/capturedImage.model';
import path from 'path';
import fs from 'fs';

export const downloadPhotosZip = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    console.log('📦 ZIP download request for session:', sessionId);
    
    // Parse timestamp from session ID (first part before the dash)
    const timestamp = parseInt(sessionId.split('-')[0]);
    const sessionDate = new Date(timestamp);
    
    console.log('🕐 Session timestamp:', sessionDate.toISOString());
    
    // Create time range (±10 minutes from session time to be safe)
    const startTime = new Date(timestamp - 10 * 60 * 1000);
    const endTime = new Date(timestamp + 10 * 60 * 1000);
    
    console.log('🔍 Searching for images between:', startTime.toISOString(), 'and', endTime.toISOString());
    
    // Find all images within this time range
    const images = await CapturedImage.find({
      timestamp: {
        $gte: startTime,
        $lte: endTime
      }
    }).sort({ timestamp: 1 });

    console.log(`📸 Found ${images.length} images for download`);

    if (images.length === 0) {
      console.log('❌ No photos found for session');
      return res.status(404).json({ error: 'No photos found for this session' });
    }

    // Create ZIP filename with timestamp
    const timeString = sessionDate.toTimeString().split(' ')[0];
    const dateString = sessionDate.toLocaleDateString('en-GB').replace(/\//g, '-');
    const zipName = `${timeString}_${dateString}_Paparazzi-PhotoBooth.zip`;

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

    let filesAdded = 0;

    // Add images to archive
    for (const image of images) {
      try {
        if (image.storageType === 'local' && image.localUrl) {
          // Extract relative path from local URL
          const urlPath = new URL(image.localUrl).pathname;
          const relativePath = urlPath.replace('/api/images/local/', '');
          const filePath = path.join(process.cwd(), 'photos', relativePath);
          
          console.log('📁 Checking file:', filePath);
          
          if (fs.existsSync(filePath)) {
            const fileName = `${image.cameraLabel}_${new Date(image.timestamp).toISOString().replace(/[:.]/g, '-')}.jpg`;
            archive.file(filePath, { name: fileName });
            filesAdded++;
            console.log('✅ Added to ZIP:', fileName);
          } else {
            console.log('❌ File not found:', filePath);
          }
        } else if (image.storageType === 's3' && image.s3Url) {
          // For S3 storage, fetch and add to archive
          const response = await fetch(image.s3Url);
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const fileName = `${image.cameraLabel}_${new Date(image.timestamp).toISOString().replace(/[:.]/g, '-')}.jpg`;
            archive.append(buffer, { name: fileName });
            filesAdded++;
            console.log('✅ Added S3 file to ZIP:', fileName);
          }
        }
      } catch (error) {
        console.error(`Error adding image ${image.imageId} to archive:`, error);
      }
    }

    console.log(`📦 Total files added to ZIP: ${filesAdded}`);

    // Finalize archive
    await archive.finalize();
    
  } catch (error) {
    console.error('Error creating ZIP download:', error);
    res.status(500).json({ error: 'Failed to create ZIP download' });
  }
};
