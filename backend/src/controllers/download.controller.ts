import { Request, Response } from 'express';
import { CapturedImage } from '../models/capturedImage.model';
import path from 'path';
import fs from 'fs';

export const downloadPhotosZip = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    console.log('📦 Collage download request for session:', sessionId);
    
    // Extract timeFolder from sessionId
    const dashIndex = sessionId.indexOf('-');
    const timeFolder = sessionId.substring(dashIndex + 1);
    const correctedTimeFolder = timeFolder.replace(/^(\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3');
    
    console.log('📁 Session folder:', correctedTimeFolder);
    
    // Path to the session folder using IMAGE_STORAGE_PATH
    const storagePath = process.env.IMAGE_STORAGE_PATH || '/app/photos';
    const sessionFolderPath = path.join(storagePath, correctedTimeFolder);
    
    console.log('📁 Storage path:', storagePath);
    console.log('📁 Full session path:', sessionFolderPath);
    
    // Check if collages exist in local storage
    const localLandscape = path.join(sessionFolderPath, 'collage_landscape.jpg');
    const localPortrait = path.join(sessionFolderPath, 'collage_portrait.jpg');
    console.log('🔍 Looking for landscape collage:', localLandscape);
    console.log('🔍 Looking for portrait collage:', localPortrait);
    const hasLocalCollages = fs.existsSync(localLandscape) && fs.existsSync(localPortrait);
    console.log('📸 Local collages found:', hasLocalCollages);
    
    if (hasLocalCollages) {
      // Send HTML page that triggers both downloads
      const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Downloading Collages...</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .loading { font-size: 18px; color: #333; }
    </style>
</head>
<body>
    <div class="loading">
        <h2>📸 Downloading Your Collages...</h2>
        <p>Your collage files will download automatically.</p>
        <p>Please wait a moment...</p>
    </div>
    <script>
        setTimeout(() => {
            // Download landscape collage
            const link1 = document.createElement('a');
            link1.href = '/api/download/${sessionId}/landscape';
            link1.download = 'collage_landscape.jpg';
            document.body.appendChild(link1);
            link1.click();
            document.body.removeChild(link1);
            
            // Download portrait collage after 1 second delay
            setTimeout(() => {
                const link2 = document.createElement('a');
                link2.href = '/api/download/${sessionId}/portrait';
                link2.download = 'collage_portrait.jpg';
                document.body.appendChild(link2);
                link2.click();
                document.body.removeChild(link2);
                
                // Show completion message
                setTimeout(() => {
                    document.querySelector('.loading').innerHTML = '<h2>✅ Downloads Complete!</h2><p>Your collage files have been downloaded.</p>';
                }, 1000);
            }, 1000);
        }, 500);
    </script>
</body>
</html>`;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
      
    } else {
      console.log('❌ No collage files found in local storage');
      res.status(404).json({ error: 'No collage files found for this session' });
    }
    
  } catch (error) {
    console.error('Error in collage download:', error);
    res.status(500).json({ error: 'Failed to download collages' });
  }
};

export const downloadSingleCollage = async (req: Request, res: Response) => {
  try {
    const { sessionId, orientation } = req.params;
    
    // Extract timeFolder from sessionId
    const dashIndex = sessionId.indexOf('-');
    const timeFolder = sessionId.substring(dashIndex + 1);
    const correctedTimeFolder = timeFolder.replace(/^(\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3');
    
    // Try local storage first using IMAGE_STORAGE_PATH
    const storagePath = process.env.IMAGE_STORAGE_PATH || '/app/photos';
    const sessionFolderPath = path.join(storagePath, correctedTimeFolder);
    const collagePath = path.join(sessionFolderPath, `collage_${orientation}.jpg`);
    
    if (fs.existsSync(collagePath)) {
      // Serve from local storage
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="collage_${orientation}.jpg"`);
      
      const fileStream = fs.createReadStream(collagePath);
      fileStream.pipe(res);
      
      console.log(`✅ Downloaded ${orientation} collage from local storage`);
    } else {
      console.log(`❌ ${orientation} collage not found in local storage`);
      res.status(404).json({ error: `${orientation} collage not found` });
    }
    
  } catch (error) {
    console.error('Error downloading single collage:', error);
    res.status(500).json({ error: 'Failed to download collage' });
  }
};
