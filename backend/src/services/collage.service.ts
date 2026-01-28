import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";
import { config } from "../config/env.config";

class CollageService {
  private basePath: string;

  constructor() {
    this.basePath = config.imageStoragePath;
  }

  /**
   * Generate collages for both orientations from all images in a folder
   */
  async generateCollage(
    folderPath: string,
    screenResolution?: { width: number; height: number },
  ): Promise<string[]> {
    try {
      const fullFolderPath = path.join(this.basePath, folderPath);

      if (!fs.existsSync(fullFolderPath)) {
        throw new Error(`Folder not found: ${fullFolderPath}`);
      }

      // Get all image files from the folder (recursively)
      const imageFiles = this.getAllImageFiles(fullFolderPath);

      if (imageFiles.length === 0) {
        throw new Error("No images found in folder");
      }

      console.log(
        `📸 Found ${imageFiles.length} images for collage in ${folderPath}`,
      );

      const collagePaths: string[] = [];

      // Determine collage save location - if folderPath contains camera subfolder, save to parent
      let collageSavePath = fullFolderPath;
      const pathParts = folderPath.split("/");
      if (pathParts.length > 1) {
        // Save collages to timestamp folder (parent directory)
        collageSavePath = path.join(this.basePath, pathParts[0]);
      }

      // Use screen resolution if provided, otherwise use default sizes
      const defaultLandscape = { width: 1920, height: 1160 };
      const defaultPortrait = { width: 1080, height: 2000 };

      const landscapeSize =
        screenResolution && screenResolution.width > screenResolution.height
          ? screenResolution
          : defaultLandscape;
      const portraitSize =
        screenResolution && screenResolution.height > screenResolution.width
          ? screenResolution
          : defaultPortrait;

      // Generate landscape collage
      const landscapeBuffer = await this.createCollageFromImages(
        imageFiles,
        "landscape",
        landscapeSize,
      );
      const landscapePath = path.join(collageSavePath, "collage_landscape.jpg");
      fs.writeFileSync(landscapePath, landscapeBuffer);
      collagePaths.push(landscapePath);

      // Generate portrait collage
      const portraitBuffer = await this.createCollageFromImages(
        imageFiles,
        "portrait",
        portraitSize,
      );
      const portraitPath = path.join(collageSavePath, "collage_portrait.jpg");
      fs.writeFileSync(portraitPath, portraitBuffer);
      collagePaths.push(portraitPath);

      console.log(`🎨 Collages created: ${collagePaths.length} files`);

      return collagePaths;
    } catch (error) {
      console.error("Error generating collage:", error);
      throw error;
    }
  }

  /**
   * Generate collage and upload to S3 if configured
   */
  async generateCollageWithS3Upload(
    folderPath: string,
    screenResolution?: { width: number; height: number },
  ): Promise<{ localPaths: string[]; s3Urls?: string[] }> {
    const localPaths = await this.generateCollage(folderPath, screenResolution);

    try {
      // Import S3 service dynamically to avoid circular dependencies
      const { s3Service } = await import("./s3.service");

      if (s3Service.isConfigured()) {
        const s3Urls: string[] = [];

        for (const localPath of localPaths) {
          const filename = path.basename(localPath);
          const collageBuffer = fs.readFileSync(localPath);
          const s3Key = `photos/${folderPath}/${filename}`;
          const s3Url = await s3Service.uploadBuffer(
            collageBuffer,
            s3Key,
            "image/jpeg",
          );
          s3Urls.push(s3Url);
          console.log(`☁️ Collage uploaded to S3: ${s3Key}`);
        }

        return { localPaths, s3Urls };
      }
    } catch (s3Error) {
      console.error("Error uploading collage to S3:", s3Error);
    }

    return { localPaths };
  }

  /**
   * Get all image files from a directory recursively
   */
  private getAllImageFiles(dirPath: string): string[] {
    const imageFiles: string[] = [];
    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

    const scanDirectory = (currentPath: string) => {
      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          scanDirectory(itemPath);
        } else if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (imageExtensions.includes(ext) && !item.startsWith("collage_")) {
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
  private async createCollageFromImages(
    imagePaths: string[],
    orientation: "landscape" | "portrait",
    canvasSize?: { width: number; height: number },
  ): Promise<Buffer> {
    const imageCount = imagePaths.length;

    // Use provided canvas size or defaults
    const canvasWidth =
      canvasSize?.width || (orientation === "landscape" ? 1920 : 1080);
    const canvasHeight =
      canvasSize?.height || (orientation === "landscape" ? 1160 : 2000);

    console.log(
      `🎨 Creating ${orientation} creative collage (${canvasWidth}x${canvasHeight}px) from ${imageCount} images`,
    );

    // Create white background
    const canvas = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    });

    // Get creative layout based on image count
    const layout = this.getCreativeLayout(
      imageCount,
      canvasWidth,
      canvasHeight,
    );

    // Prepare composite operations
    const compositeOperations: any[] = [];

    for (let i = 0; i < Math.min(imagePaths.length, layout.length); i++) {
      const imageLayout = layout[i];

      try {
        // Process image with rotation and effects
        let processedImage = sharp(imagePaths[i]).resize(
          imageLayout.width,
          imageLayout.height,
          {
            fit: "cover",
            position: "center",
            background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background
          },
        );

        // Add rotation if specified with white background
        if (imageLayout.rotation) {
          processedImage = processedImage.rotate(imageLayout.rotation, {
            background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background for rotation
          });
        }

        // // Add border/shadow effect for some images
        // if (imageLayout.border) {
        //   processedImage = processedImage.extend({
        //     top: 5,
        //     bottom: 5,
        //     left: 5,
        //     right: 5,
        //     background: { r: 0, g: 0, b: 0, alpha: 1 }, // Black border
        //   });
        // }

        const imageBuffer = await processedImage
          .jpeg({ quality: 95 })
          .toBuffer();

        compositeOperations.push({
          input: imageBuffer,
          top: imageLayout.y,
          left: imageLayout.x,
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
   * Get creative artistic layout patterns - like real photo collages
   * Uses grid-based cells to ensure no overlap
   */
  private getCreativeLayout(
    imageCount: number,
    canvasWidth: number,
    canvasHeight: number,
  ): Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    border?: boolean;
  }> {
    const layout = [];
    const margin = 20; // Margin between cells

    // Determine grid layout based on image count
    const gridConfig = this.calculateGridLayout(
      imageCount,
      canvasWidth,
      canvasHeight,
    );

    // Calculate cell dimensions
    const cellWidth = Math.floor(
      (canvasWidth - (gridConfig.cols + 1) * margin) / gridConfig.cols,
    );
    const cellHeight = Math.floor(
      (canvasHeight - (gridConfig.rows + 1) * margin) / gridConfig.rows,
    );

    console.log(
      `📐 Grid: ${gridConfig.rows}x${gridConfig.cols}, Cell size: ${cellWidth}x${cellHeight}`,
    );

    // Creative rotations - more variety
    const rotations = [
      -25, -20, -15, -10, -8, -5, -3, 0, 0, 0, 3, 5, 8, 10, 15, 20, 25,
    ];

    for (let i = 0; i < imageCount; i++) {
      // Calculate which cell this image belongs to
      const row = Math.floor(i / gridConfig.cols);
      const col = i % gridConfig.cols;

      // Calculate cell position
      const cellX = margin + col * (cellWidth + margin);
      const cellY = margin + row * (cellHeight + margin);

      // Random size variation within the cell (60-85% of cell size)
      const sizeVariation = 0.6 + Math.random() * 0.25;
      const baseWidth = Math.floor(cellWidth * sizeVariation);
      const baseHeight = Math.floor(cellHeight * sizeVariation);

      // Random rotation
      const rotation = rotations[Math.floor(Math.random() * rotations.length)];

      // Calculate rotated bounding box
      const rotatedBounds = this.calculateRotatedBounds(
        baseWidth,
        baseHeight,
        rotation,
      );

      // Scale down if rotated image exceeds cell boundaries
      let finalWidth = baseWidth;
      let finalHeight = baseHeight;

      if (
        rotatedBounds.width > cellWidth ||
        rotatedBounds.height > cellHeight
      ) {
        const scaleX = cellWidth / rotatedBounds.width;
        const scaleY = cellHeight / rotatedBounds.height;
        const scale = Math.min(scaleX, scaleY) * 0.95; // 95% to add small buffer

        finalWidth = Math.floor(baseWidth * scale);
        finalHeight = Math.floor(baseHeight * scale);
      }

      // Recalculate rotated bounds with final size
      const finalRotatedBounds = this.calculateRotatedBounds(
        finalWidth,
        finalHeight,
        rotation,
      );

      // Center the rotated image within its cell
      const x = Math.floor(cellX + (cellWidth - finalRotatedBounds.width) / 2);
      const y = Math.floor(
        cellY + (cellHeight - finalRotatedBounds.height) / 2,
      );

      layout.push({
        x: x,
        y: y,
        width: finalWidth,
        height: finalHeight,
        rotation: rotation,
        border: Math.random() > 0.3, // 70% chance of border for depth
      });
    }

    return layout;
  }

  /**
   * Calculate grid layout based on image count and canvas dimensions
   */
  private calculateGridLayout(
    imageCount: number,
    canvasWidth: number,
    canvasHeight: number,
  ): { rows: number; cols: number } {
    const isLandscape = canvasWidth > canvasHeight;

    if (imageCount === 1) return { rows: 1, cols: 1 };
    if (imageCount === 2)
      return isLandscape ? { rows: 1, cols: 2 } : { rows: 2, cols: 1 };
    if (imageCount === 3)
      return isLandscape ? { rows: 1, cols: 3 } : { rows: 3, cols: 1 };
    if (imageCount === 4) return { rows: 2, cols: 2 };
    if (imageCount <= 6)
      return isLandscape ? { rows: 2, cols: 3 } : { rows: 3, cols: 2 };
    if (imageCount <= 9) return { rows: 3, cols: 3 };
    if (imageCount <= 12)
      return isLandscape ? { rows: 3, cols: 4 } : { rows: 4, cols: 3 };
    if (imageCount <= 16) return { rows: 4, cols: 4 };
    if (imageCount <= 20)
      return isLandscape ? { rows: 4, cols: 5 } : { rows: 5, cols: 4 };

    // For larger counts
    const cols = Math.ceil(
      Math.sqrt(imageCount * (canvasWidth / canvasHeight)),
    );
    const rows = Math.ceil(imageCount / cols);
    return { rows, cols };
  }

  /**
   * Calculate the bounding box dimensions after rotation
   */
  private calculateRotatedBounds(
    width: number,
    height: number,
    rotation: number,
  ): { width: number; height: number } {
    // Convert rotation to radians
    const radians = (Math.abs(rotation) * Math.PI) / 180;

    // Calculate rotated bounding box
    const rotatedWidth =
      Math.abs(width * Math.cos(radians)) +
      Math.abs(height * Math.sin(radians));
    const rotatedHeight =
      Math.abs(width * Math.sin(radians)) +
      Math.abs(height * Math.cos(radians));

    // Add border padding (5px on each side = 10px total)
    const borderPadding = 10;

    return {
      width: Math.ceil(rotatedWidth + borderPadding),
      height: Math.ceil(rotatedHeight + borderPadding),
    };
  }

  /**
   * Calculate optimal grid dimensions for image count that fits in canvas
   */
  private calculateOptimalGrid(imageCount: number): {
    rows: number;
    cols: number;
  } {
    if (imageCount === 1) return { rows: 1, cols: 1 };
    if (imageCount === 2) return { rows: 1, cols: 2 };
    if (imageCount === 3) return { rows: 1, cols: 3 };
    if (imageCount === 4) return { rows: 2, cols: 2 };
    if (imageCount <= 6) return { rows: 2, cols: 3 };
    if (imageCount <= 9) return { rows: 3, cols: 3 };
    if (imageCount <= 12) return { rows: 3, cols: 4 };
    if (imageCount <= 16) return { rows: 4, cols: 4 };
    if (imageCount <= 20) return { rows: 4, cols: 5 };
    if (imageCount <= 25) return { rows: 5, cols: 5 };

    // For larger counts, calculate to fit screen
    const cols = Math.ceil(Math.sqrt(imageCount));
    const rows = Math.ceil(imageCount / cols);

    // Ensure we don't exceed reasonable limits (max 6x6 grid)
    if (rows > 6 || cols > 6) {
      return { rows: 6, cols: 6 };
    }

    return { rows, cols };
  }

  /**
   * Calculate optimal grid dimensions for given number of images and orientation
   */
  private calculateGridForOrientation(
    imageCount: number,
    orientation: "landscape" | "portrait",
  ): { rows: number; cols: number; imageWidth: number; imageHeight: number } {
    const targetWidth = orientation === "landscape" ? 1920 : 1080;
    const targetHeight = orientation === "landscape" ? 1080 : 1920;

    let rows: number, cols: number;

    if (imageCount === 1) {
      rows = 1;
      cols = 1;
    } else if (imageCount === 2) {
      if (orientation === "landscape") {
        rows = 1;
        cols = 2;
      } else {
        rows = 2;
        cols = 1;
      }
    } else if (imageCount <= 4) {
      rows = 2;
      cols = 2;
    } else if (imageCount <= 6) {
      if (orientation === "landscape") {
        rows = 2;
        cols = 3;
      } else {
        rows = 3;
        cols = 2;
      }
    } else if (imageCount <= 9) {
      rows = 3;
      cols = 3;
    } else if (imageCount <= 12) {
      if (orientation === "landscape") {
        rows = 3;
        cols = 4;
      } else {
        rows = 4;
        cols = 3;
      }
    } else if (imageCount <= 16) {
      rows = 4;
      cols = 4;
    } else if (imageCount <= 20) {
      if (orientation === "landscape") {
        rows = 4;
        cols = 5;
      } else {
        rows = 5;
        cols = 4;
      }
    } else {
      // For larger numbers, calculate based on orientation
      if (orientation === "landscape") {
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
  collageExists(
    folderPath: string,
    orientation?: "landscape" | "portrait",
  ): boolean {
    // Determine collage location - if folderPath contains camera subfolder, check parent
    let collageCheckPath = folderPath;
    const pathParts = folderPath.split("/");
    if (pathParts.length > 1) {
      // Check collages in timestamp folder (parent directory)
      collageCheckPath = pathParts[0];
    }

    if (orientation) {
      const collagePath = path.join(
        this.basePath,
        collageCheckPath,
        `collage_${orientation}.jpg`,
      );
      return fs.existsSync(collagePath);
    }

    // Check if any collage exists
    const landscapePath = path.join(
      this.basePath,
      collageCheckPath,
      "collage_landscape.jpg",
    );
    const portraitPath = path.join(
      this.basePath,
      collageCheckPath,
      "collage_portrait.jpg",
    );
    return fs.existsSync(landscapePath) || fs.existsSync(portraitPath);
  }

  /**
   * Get collage path for a folder
   */
  getCollagePath(
    folderPath: string,
    orientation: "landscape" | "portrait",
  ): string {
    // Determine collage location - if folderPath contains camera subfolder, use parent
    let collagePathBase = folderPath;
    const pathParts = folderPath.split("/");
    if (pathParts.length > 1) {
      // Get collages from timestamp folder (parent directory)
      collagePathBase = pathParts[0];
    }

    return path.join(
      this.basePath,
      collagePathBase,
      `collage_${orientation}.jpg`,
    );
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
      console.error("Error generating missing collages:", error);
    }
  }

  /**
   * Get all folders in the base path
   */
  private getAllFolders(): string[] {
    const folders: string[] = [];

    const scanForFolders = (currentPath: string, relativePath: string = "") => {
      if (!fs.existsSync(currentPath)) return;

      const items = fs.readdirSync(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const itemRelativePath = relativePath
          ? path.join(relativePath, item)
          : item;

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
