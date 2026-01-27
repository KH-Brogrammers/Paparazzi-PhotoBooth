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
            position: 'center'
          });

        // Add rotation if specified
        if (imageLayout.rotation) {
          processedImage = processedImage.rotate(imageLayout.rotation, { background: { r: 255, g: 255, b: 255, alpha: 0 } });
        }

        // Add border/shadow effect for some images
        if (imageLayout.border) {
          processedImage = processedImage.extend({
            top: 5, bottom: 5, left: 5, right: 5,
            background: { r: 0, g: 0, b: 0, alpha: 1 }
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
   * Get creative layout patterns based on image count
   */
  private getCreativeLayout(imageCount: number, canvasWidth: number, canvasHeight: number): Array<{x: number, y: number, width: number, height: number, rotation?: number, border?: boolean}> {
    const layouts: any = {
      1: [ // Single image - large centered
        { x: canvasWidth * 0.1, y: canvasHeight * 0.1, width: canvasWidth * 0.8, height: canvasHeight * 0.8, border: true }
      ],
      
      2: [ // Two images - one large, one small rotated
        { x: 50, y: 50, width: canvasWidth * 0.6, height: canvasHeight * 0.7, border: true },
        { x: canvasWidth * 0.65, y: canvasHeight * 0.2, width: canvasWidth * 0.25, height: canvasHeight * 0.4, rotation: 15, border: true }
      ],
      
      3: [ // Three images - creative triangle
        { x: canvasWidth * 0.05, y: canvasHeight * 0.05, width: canvasWidth * 0.5, height: canvasHeight * 0.6, border: true },
        { x: canvasWidth * 0.6, y: canvasHeight * 0.1, width: canvasWidth * 0.35, height: canvasHeight * 0.35, rotation: -10, border: true },
        { x: canvasWidth * 0.55, y: canvasHeight * 0.5, width: canvasWidth * 0.4, height: canvasHeight * 0.4, rotation: 8, border: true }
      ],
      
      4: [ // Four images - magazine style
        { x: 30, y: 30, width: canvasWidth * 0.45, height: canvasHeight * 0.55, border: true },
        { x: canvasWidth * 0.52, y: 20, width: canvasWidth * 0.25, height: canvasHeight * 0.3, rotation: 5, border: true },
        { x: canvasWidth * 0.78, y: canvasHeight * 0.15, width: canvasWidth * 0.18, height: canvasHeight * 0.25, rotation: -12, border: true },
        { x: canvasWidth * 0.5, y: canvasHeight * 0.55, width: canvasWidth * 0.45, height: canvasHeight * 0.4, rotation: 3, border: true }
      ],
      
      5: [ // Five images - scattered creative
        { x: 40, y: 40, width: canvasWidth * 0.35, height: canvasHeight * 0.4, border: true },
        { x: canvasWidth * 0.4, y: 20, width: canvasWidth * 0.3, height: canvasHeight * 0.35, rotation: 8, border: true },
        { x: canvasWidth * 0.72, y: canvasHeight * 0.05, width: canvasWidth * 0.25, height: canvasHeight * 0.3, rotation: -15, border: true },
        { x: 60, y: canvasHeight * 0.5, width: canvasWidth * 0.4, height: canvasHeight * 0.45, rotation: -5, border: true },
        { x: canvasWidth * 0.55, y: canvasHeight * 0.6, width: canvasWidth * 0.35, height: canvasHeight * 0.35, rotation: 12, border: true }
      ],
      
      6: [ // Six images - dynamic mosaic
        { x: 30, y: 30, width: canvasWidth * 0.4, height: canvasHeight * 0.35, border: true },
        { x: canvasWidth * 0.45, y: 20, width: canvasWidth * 0.25, height: canvasHeight * 0.25, rotation: 10, border: true },
        { x: canvasWidth * 0.72, y: 40, width: canvasWidth * 0.25, height: canvasHeight * 0.3, rotation: -8, border: true },
        { x: 20, y: canvasHeight * 0.4, width: canvasWidth * 0.3, height: canvasHeight * 0.35, rotation: 5, border: true },
        { x: canvasWidth * 0.35, y: canvasHeight * 0.5, width: canvasWidth * 0.35, height: canvasHeight * 0.4, rotation: -3, border: true },
        { x: canvasWidth * 0.72, y: canvasHeight * 0.65, width: canvasWidth * 0.25, height: canvasHeight * 0.3, rotation: 15, border: true }
      ]
    };

    // For more than 6 images, create dynamic scattered layout
    if (imageCount > 6) {
      const layout = [];
      const minSize = Math.min(canvasWidth, canvasHeight) * 0.15;
      const maxSize = Math.min(canvasWidth, canvasHeight) * 0.35;
      
      for (let i = 0; i < imageCount; i++) {
        const size = minSize + (maxSize - minSize) * Math.random();
        const x = Math.random() * (canvasWidth - size);
        const y = Math.random() * (canvasHeight - size);
        const rotation = (Math.random() - 0.5) * 30; // -15 to +15 degrees
        
        layout.push({
          x: Math.floor(x),
          y: Math.floor(y),
          width: Math.floor(size),
          height: Math.floor(size * (0.8 + Math.random() * 0.4)), // Vary aspect ratio
          rotation: Math.floor(rotation),
          border: Math.random() > 0.3 // 70% chance of border
        });
      }
      return layout;
    }

    return layouts[imageCount] || layouts[6]; // Fallback to 6-image layout
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
