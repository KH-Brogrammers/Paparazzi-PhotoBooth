import { collageService } from '../services/collage.service';
import * as fs from 'fs';
import * as path from 'path';

// Simple test function to verify collage generation
async function testCollageGeneration() {
  try {
    console.log('🧪 Testing collage generation...');
    
    // Check if there are any existing folders with images
    const testFolders = collageService['getAllFolders']();
    
    if (testFolders.length === 0) {
      console.log('ℹ️ No existing folders with images found. Collage generation will work when images are captured.');
      return;
    }
    
    console.log(`📁 Found ${testFolders.length} folders with images:`);
    testFolders.forEach(folder => console.log(`  - ${folder}`));
    
    // Test generating missing collages
    await collageService.generateMissingCollages();
    
    console.log('✅ Collage generation test completed successfully!');
    
  } catch (error) {
    console.error('❌ Collage generation test failed:', error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testCollageGeneration();
}

export { testCollageGeneration };
