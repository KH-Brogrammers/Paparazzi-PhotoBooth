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
   * Create a collage from an array of image file paths
   */
  private async createCollageFromImages(imagePaths: string[], orientation: 'landscape' | 'portrait'): Promise<Buffer> {
    const imageCount = imagePaths.length;
    
    // Calculate grid dimensions based on orientation
    const { rows, cols, imageWidth, imageHeight } = this.calculateGridForOrientation(imageCount, orientation);
    
    const padding = 10;
    const logoHeight = 80; // Reserve space for logo at bottom
    
    // Calculate canvas dimensions
    const canvasWidth = cols * imageWidth + (cols + 1) * padding;
    const canvasHeight = rows * imageHeight + (rows + 1) * padding + logoHeight;
    
    console.log(`🎨 Creating ${orientation} ${rows}x${cols} collage (${canvasWidth}x${canvasHeight}px) from ${imageCount} images`);

    // For 6 images, separate landscape and portrait images
    let orderedImagePaths = imagePaths;
    if (imageCount === 6) {
      orderedImagePaths = await this.orderImagesForSixImageCollage(imagePaths, orientation);
    }

    // Create white background
    const canvas = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    });

    // Prepare composite operations
    const compositeOperations: any[] = [];

    for (let i = 0; i < orderedImagePaths.length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      
      const x = col * imageWidth + (col + 1) * padding;
      const y = row * imageHeight + (row + 1) * padding;

      try {
        // Resize and process each image to fit the rectangular slot
        const processedImage = await sharp(orderedImagePaths[i])
          .resize(imageWidth, imageHeight, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        compositeOperations.push({
          input: processedImage,
          top: y,
          left: x
        });
      } catch (error) {
        console.error(`Error processing image ${orderedImagePaths[i]}:`, error);
        // Skip this image and continue
      }
    }

    // Logo overlay disabled for collages - collages will be generated without logo
    // The logo is still displayed in the UI header but not burned into collage images

    // Composite all images onto the canvas
    const collageBuffer = await canvas
      .composite(compositeOperations)
      .jpeg({ quality: 90 })
      .toBuffer();

    return collageBuffer;
  }

  /**
   * Order images for 6-image collage, placing landscape images in center positions
   */
  private async orderImagesForSixImageCollage(imagePaths: string[], orientation: 'landscape' | 'portrait'): Promise<string[]> {
    // Determine image orientations
    const imageOrientations: { path: string; isLandscape: boolean }[] = [];
    
    for (const imagePath of imagePaths) {
      try {
        const metadata = await sharp(imagePath).metadata();
        const isLandscape = (metadata.width || 0) > (metadata.height || 0);
        imageOrientations.push({ path: imagePath, isLandscape });
      } catch (error) {
        console.error(`Error reading image metadata for ${imagePath}:`, error);
        // If we can't read metadata, assume portrait
        imageOrientations.push({ path: imagePath, isLandscape: false });
      }
    }

    // Separate landscape and portrait images
    const landscapeImages = imageOrientations.filter(img => img.isLandscape).map(img => img.path);
    const portraitImages = imageOrientations.filter(img => !img.isLandscape).map(img => img.path);

    console.log(`📐 6-image collage: ${landscapeImages.length} landscape, ${portraitImages.length} portrait`);

    // Define center positions based on collage orientation
    // Landscape collage (2×3): positions [1, 4] are center
    // Portrait collage (3×2): positions [2, 3] are center (middle row)
    const centerPositions = orientation === 'landscape' ? [1, 4] : [2, 3];
    
    // Create ordered array with 6 positions
    const orderedPaths: string[] = new Array(6);
    
    // Place landscape images in center positions
    for (let i = 0; i < Math.min(landscapeImages.length, centerPositions.length); i++) {
      orderedPaths[centerPositions[i]] = landscapeImages[i];
    }
    
    // Fill remaining positions with portrait images
    let portraitIndex = 0;
    for (let i = 0; i < 6; i++) {
      if (!orderedPaths[i] && portraitIndex < portraitImages.length) {
        orderedPaths[i] = portraitImages[portraitIndex];
        portraitIndex++;
      }
    }
    
    // If there are any remaining landscape images (more than 2), add them to remaining slots
    let landscapeIndex = centerPositions.length;
    for (let i = 0; i < 6; i++) {
      if (!orderedPaths[i] && landscapeIndex < landscapeImages.length) {
        orderedPaths[i] = landscapeImages[landscapeIndex];
        landscapeIndex++;
      }
    }
    
    return orderedPaths;
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
  async  generateMissingCollages(): Promise<void> {
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
