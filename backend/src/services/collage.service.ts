import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { config } from '../config/env.config';

class CollageService {
  private basePath: string;

  constructor() {
    this.basePath = config.imageStoragePath;
  }

  /**
   * Generate collages for both orientations from all images in a folder
   */
  async generateCollage(folderPath: string): Promise<string[]> {
    try {
      const fullFolderPath = path.join(this.basePath, folderPath);
      
      if (!fs.existsSync(fullFolderPath)) {
        throw new Error(`Folder not found: ${fullFolderPath}`);
      }

      // Get all image files from the folder (recursively)
      const imageFiles = this.getAllImageFiles(fullFolderPath);
      
      if (imageFiles.length === 0) {
        throw new Error('No images found in folder');
      }

      console.log(`📸 Found ${imageFiles.length} images for collage in ${folderPath}`);

      const collagePaths: string[] = [];

      // Determine collage save location - if folderPath contains camera subfolder, save to parent
      let collageSavePath = fullFolderPath;
      const pathParts = folderPath.split('/');
      if (pathParts.length > 1) {
        // Save collages to timestamp folder (parent directory)
        collageSavePath = path.join(this.basePath, pathParts[0]);
      }

      // Generate landscape collage (1920x1080)
      const landscapeBuffer = await this.createCollageFromImages(imageFiles, 'landscape');
      const landscapePath = path.join(collageSavePath, 'collage_landscape.jpg');
      fs.writeFileSync(landscapePath, landscapeBuffer);
      collagePaths.push(landscapePath);

      // Generate portrait collage (1080x1920)
      const portraitBuffer = await this.createCollageFromImages(imageFiles, 'portrait');
      const portraitPath = path.join(collageSavePath, 'collage_portrait.jpg');
      fs.writeFileSync(portraitPath, portraitBuffer);
      collagePaths.push(portraitPath);
      
      console.log(`🎨 Collages created: ${collagePaths.length} files`);
      
      return collagePaths;
    } catch (error) {
      console.error('Error generating collage:', error);
      throw error;
    }
  }

  /**
   * Generate collage and upload to S3 if configured
   */
  async generateCollageWithS3Upload(folderPath: string): Promise<{ localPaths: string[]; s3Urls?: string[] }> {
    const localPaths = await this.generateCollage(folderPath);
    
    try {
      // Import S3 service dynamically to avoid circular dependencies
      const { s3Service } = await import('./s3.service');
      
      if (s3Service.isConfigured()) {
        const s3Urls: string[] = [];
        
        for (const localPath of localPaths) {
          const filename = path.basename(localPath);
          const collageBuffer = fs.readFileSync(localPath);
          const s3Key = `photos/${folderPath}/${filename}`;
          const s3Url = await s3Service.uploadBuffer(collageBuffer, s3Key, 'image/jpeg');
          s3Urls.push(s3Url);
          console.log(`☁️ Collage uploaded to S3: ${s3Key}`);
        }
        
        return { localPaths, s3Urls };
      }
    } catch (s3Error) {
      console.error('Error uploading collage to S3:', s3Error);
    }
    
    return { localPaths };
  }

  /**
   * Get all image files from a directory recursively
   */
  private getAllImageFiles(dirPath: string): string[] {
    const imageFiles: string[] = [];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    const scanDirectory = (currentPath: string) => {
      const items = fs.readdirSync(currentPath);
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          scanDirectory(itemPath);
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (imageExtensions.includes(ext) && !item.startsWith('collage_')) {
            imageFiles.push(itemPath);
          }
        }
      }
    };

    scanDirectory(dirPath);
    return imageFiles.sort(); // Sort for consistent ordering
  }

  /**
   * Create a collage from an array of image file paths with creative layouts
   */
  private async createCollageFromImages(imagePaths: string[], orientation: 'landscape' | 'portrait'): Promise<Buffer> {
    const imageCount = imagePaths.length;
    
    // Canvas dimensions
    const canvasWidth = orientation === 'landscape' ? 1920 : 1080;
    const canvasHeight = orientation === 'landscape' ? 1160 : 2000; // Leave space for logo
    
    console.log(`🎨 Creating ${orientation} creative collage (${canvasWidth}x${canvasHeight}px) from ${imageCount} images`);

    // Create white background
    const canvas = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    });

    // Get creative layout based on image count
    const layout = this.getCreativeLayout(imageCount, canvasWidth, canvasHeight);
    
    // Prepare composite operations
    const compositeOperations: any[] = [];

    for (let i = 0; i < Math.min(imagePaths.length, layout.length); i++) {
      const imageLayout = layout[i];
      
      try {
        // Process image with rotation and effects
        let processedImage = sharp(imagePaths[i])
          .resize(imageLayout.width, imageLayout.height, {
            fit: 'cover',
            position: 'center',
            background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
          });

        // Add rotation if specified with white background
        if (imageLayout.rotation) {
          processedImage = processedImage.rotate(imageLayout.rotation, { 
            background: { r: 255, g: 255, b: 255, alpha: 1 } // White background for rotation
          });
        }

        // Add border/shadow effect for some images
        if (imageLayout.border) {
          processedImage = processedImage.extend({
            top: 5, bottom: 5, left: 5, right: 5,
            background: { r: 0, g: 0, b: 0, alpha: 1 } // Black border
          });
        }

        const imageBuffer = await processedImage.jpeg({ quality: 85 }).toBuffer();

        compositeOperations.push({
          input: imageBuffer,
          top: imageLayout.y,
          left: imageLayout.x
        });
      } catch (error) {
        console.error(`Error processing image ${imagePaths[i]}:`, error);
      }
    }

    // Composite all images onto the canvas
    const collageBuffer = await canvas
      .composite(compositeOperations)
      .jpeg({ quality: 90 })
      .toBuffer();

    return collageBuffer;
  }

  /**
   * Get creative layout patterns based on image count with no overlaps
   */
  private getCreativeLayout(imageCount: number, canvasWidth: number, canvasHeight: number): Array<{x: number, y: number, width: number, height: number, rotation?: number, border?: boolean}> {
    const padding = 20; // Space between photos
    
    // Calculate grid dimensions
    const { rows, cols } = this.calculateOptimalGrid(imageCount);
    
    // Calculate cell dimensions
    const cellWidth = (canvasWidth - (cols + 1) * padding) / cols;
    const cellHeight = (canvasHeight - (rows + 1) * padding) / rows;
    
    // Create array of grid positions
    const gridPositions = [];
    for (let i = 0; i < imageCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      gridPositions.push({ row, col });
    }
    
    // Shuffle grid positions randomly so photos don't appear in sequence
    for (let i = gridPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gridPositions[i], gridPositions[j]] = [gridPositions[j], gridPositions[i]];
    }
    
    const layout = [];
    
    for (let i = 0; i < imageCount; i++) {
      const { row, col } = gridPositions[i];
      
      // Base position in grid
      const baseX = col * (cellWidth + padding) + padding;
      const baseY = row * (cellHeight + padding) + padding;
      
      // Add some creative variation within each cell (but no overlap)
      const sizeVariation = 0.85 + Math.random() * 0.15; // 85-100% of cell size
      const width = Math.floor(cellWidth * sizeVariation);
      const height = Math.floor(cellHeight * sizeVariation);
      
      // Center the photo in its cell
      const x = baseX + (cellWidth - width) / 2;
      const y = baseY + (cellHeight - height) / 2;
      
      // Add slight rotation for creativity (but keep it small)
      const rotation = (Math.random() - 0.5) * 10; // -5 to +5 degrees
      
      layout.push({
        x: Math.floor(x),
        y: Math.floor(y),
        width,
        height,
        rotation: Math.floor(rotation),
        border: Math.random() > 0.4 // 60% chance of border
      });
    }
    
    return layout;
  }

  /**
   * Calculate optimal grid dimensions for image count
   */
  private calculateOptimalGrid(imageCount: number): { rows: number, cols: number } {
    if (imageCount === 1) return { rows: 1, cols: 1 };
    if (imageCount === 2) return { rows: 1, cols: 2 };
    if (imageCount === 3) return { rows: 1, cols: 3 };
    if (imageCount === 4) return { rows: 2, cols: 2 };
    if (imageCount <= 6) return { rows: 2, cols: 3 };
    if (imageCount <= 9) return { rows: 3, cols: 3 };
    if (imageCount <= 12) return { rows: 3, cols: 4 };
    if (imageCount <= 16) return { rows: 4, cols: 4 };
    if (imageCount <= 20) return { rows: 4, cols: 5 };
    
    // For larger counts, calculate dynamically
    const cols = Math.ceil(Math.sqrt(imageCount));
    const rows = Math.ceil(imageCount / cols);
    return { rows, cols };
  }

  /**
   * Calculate optimal grid dimensions for given number of images and orientation
   */
  private calculateGridForOrientation(imageCount: number, orientation: 'landscape' | 'portrait'): { rows: number; cols: number; imageWidth: number; imageHeight: number } {
    const targetWidth = orientation === 'landscape' ? 1920 : 1080;
    const targetHeight = orientation === 'landscape' ? 1080 : 1920;
    
    let rows: number, cols: number;
    
    if (imageCount === 1) {
      rows = 1; cols = 1;
    } else if (imageCount === 2) {
      if (orientation === 'landscape') {
        rows = 1; cols = 2;
      } else {
        rows = 2; cols = 1;
      }
    } else if (imageCount <= 4) {
      rows = 2; cols = 2;
    } else if (imageCount <= 6) {
      if (orientation === 'landscape') {
        rows = 2; cols = 3;
      } else {
        rows = 3; cols = 2;
      }
    } else if (imageCount <= 9) {
      rows = 3; cols = 3;
    } else if (imageCount <= 12) {
      if (orientation === 'landscape') {
        rows = 3; cols = 4;
      } else {
        rows = 4; cols = 3;
      }
    } else if (imageCount <= 16) {
      rows = 4; cols = 4;
    } else if (imageCount <= 20) {
      if (orientation === 'landscape') {
        rows = 4; cols = 5;
      } else {
        rows = 5; cols = 4;
      }
    } else {
      // For larger numbers, calculate based on orientation
      if (orientation === 'landscape') {
        cols = Math.ceil(Math.sqrt(imageCount * 1.77)); // 16:9 ratio
        rows = Math.ceil(imageCount / cols);
      } else {
        rows = Math.ceil(Math.sqrt(imageCount * 1.77)); // 9:16 ratio
        cols = Math.ceil(imageCount / rows);
      }
    }
    
    // Calculate image dimensions to fit target canvas dimensions
    const padding = 10;
    const availableWidth = targetWidth - (cols + 1) * padding;
    const availableHeight = targetHeight - (rows + 1) * padding;
    const imageWidth = Math.floor(availableWidth / cols);
    const imageHeight = Math.floor(availableHeight / rows);
    
    return { rows, cols, imageWidth, imageHeight };
  }

  /**
   * Check if collage exists for a folder
   */
  collageExists(folderPath: string, orientation?: 'landscape' | 'portrait'): boolean {
    // Determine collage location - if folderPath contains camera subfolder, check parent
    let collageCheckPath = folderPath;
    const pathParts = folderPath.split('/');
    if (pathParts.length > 1) {
      // Check collages in timestamp folder (parent directory)
      collageCheckPath = pathParts[0];
    }

    if (orientation) {
      const collagePath = path.join(this.basePath, collageCheckPath, `collage_${orientation}.jpg`);
      return fs.existsSync(collagePath);
    }
    
    // Check if any collage exists
    const landscapePath = path.join(this.basePath, collageCheckPath, 'collage_landscape.jpg');
    const portraitPath = path.join(this.basePath, collageCheckPath, 'collage_portrait.jpg');
    return fs.existsSync(landscapePath) || fs.existsSync(portraitPath);
  }

  /**
   * Get collage path for a folder
   */
  getCollagePath(folderPath: string, orientation: 'landscape' | 'portrait'): string {
    // Determine collage location - if folderPath contains camera subfolder, use parent
    let collagePathBase = folderPath;
    const pathParts = folderPath.split('/');
    if (pathParts.length > 1) {
      // Get collages from timestamp folder (parent directory)
      collagePathBase = pathParts[0];
    }

    return path.join(this.basePath, collagePathBase, `collage_${orientation}.jpg`);
  }

  /**
   * Generate collage for all folders that don't have one
   */
  async generateMissingCollages(): Promise<void> {
    try {
      const folders = this.getAllFolders();
      
      for (const folder of folders) {
        if (!this.collageExists(folder)) {
          try {
            await this.generateCollageWithS3Upload(folder);
          } catch (error) {
            console.error(`Failed to generate collage for ${folder}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error generating missing collages:', error);
    }
  }

  /**
   * Get all folders in the base path
   */
  private getAllFolders(): string[] {
    const folders: string[] = [];
    
    const scanForFolders = (currentPath: string, relativePath: string = '') => {
      if (!fs.existsSync(currentPath)) return;
      
      const items = fs.readdirSync(currentPath);
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
        
        if (fs.statSync(itemPath).isDirectory()) {
          // Check if this folder contains images
          const hasImages = this.getAllImageFiles(itemPath).length > 0;
          if (hasImages) {
            folders.push(itemRelativePath);
          }
          
          // Recursively scan subdirectories
          scanForFolders(itemPath, itemRelativePath);
        }
      }
    };

    scanForFolders(this.basePath);
    return folders;
  }
}

export const collageService = new CollageService();
