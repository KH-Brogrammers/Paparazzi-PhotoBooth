import { Request, Response } from 'express';
import { CapturedImage } from '../models/capturedImage.model';
import { config } from '../config/env.config';
import path from 'path';
import fs from 'fs';

export const downloadPhotosZip = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    console.log('📦 Collage download request for session:', sessionId);
    
    // Use configured photos directory path
    const photosPath = config.imageStoragePath;
    console.log('📁 Photos path:', photosPath);
    
    // Find the most recent folder with collages
    let sessionFolderPath: string | null = null;
    
    if (fs.existsSync(photosPath)) {
      const folders = fs.readdirSync(photosPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .sort((a, b) => b.localeCompare(a)); // Sort newest first
      
      // console.log('📁 Available folders:', folders);
      
      // Look for folder with collages
      for (const folder of folders) {
        const folderPath = path.join(photosPath, folder);
        const landscapePath = path.join(folderPath, 'collage_landscape.jpg');
        const portraitPath = path.join(folderPath, 'collage_portrait.jpg');
        
        console.log(`🔍 Checking folder: ${folder}`);
        console.log(`🔍 Landscape: ${fs.existsSync(landscapePath)}`);
        console.log(`🔍 Portrait: ${fs.existsSync(portraitPath)}`);
        
        if (fs.existsSync(landscapePath) && fs.existsSync(portraitPath)) {
          sessionFolderPath = folderPath;
          console.log('✅ Found collages in folder:', folder);
          break;
        }
      }
    }
    
    if (sessionFolderPath) {
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
      console.log('❌ No collage files found in photos directory');
      res.status(404).json({ error: 'No collage files found' });
    }
    
  } catch (error) {
    console.error('Error in collage download:', error);
    res.status(500).json({ error: 'Failed to download collages' });
  }
};

export const downloadSingleCollage = async (req: Request, res: Response) => {
  try {
    const { sessionId, orientation } = req.params;
    
    console.log(`📥 Single collage download: ${orientation}`);
    
    // Use configured photos directory path
    const photosPath = config.imageStoragePath;
    
    // Find the most recent folder with the requested collage
    let collagePath: string | null = null;
    
    if (fs.existsSync(photosPath)) {
      const folders = fs.readdirSync(photosPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .sort((a, b) => b.localeCompare(a)); // Sort newest first
      
      // Look for folder with the requested collage
      for (const folder of folders) {
        const folderPath = path.join(photosPath, folder);
        const testCollagePath = path.join(folderPath, `collage_${orientation}.jpg`);
        
        if (fs.existsSync(testCollagePath)) {
          collagePath = testCollagePath;
          console.log(`✅ Found ${orientation} collage in folder:`, folder);
          break;
        }
      }
    }
    
    if (collagePath) {
      // Serve from local storage
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="collage_${orientation}.jpg"`);
      
      const fileStream = fs.createReadStream(collagePath);
      fileStream.pipe(res);
      
      console.log(`✅ Downloaded ${orientation} collage from local storage`);
    } else {
      console.log(`❌ ${orientation} collage not found`);
      res.status(404).json({ error: `${orientation} collage not found` });
    }
    
  } catch (error) {
    console.error('Error downloading single collage:', error);
    res.status(500).json({ error: 'Failed to download collage' });
  }
};
