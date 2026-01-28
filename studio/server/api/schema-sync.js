import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function schemaSyncHandler(req, res) {
  try {
    // Create temporary directory
    const tempDir = path.join(process.cwd(), 'temp_schemas');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Clone the repository to temp directory
    await execAsync(`git clone https://github.com/weswalz/sanity-schemas.git ${tempDir}`);

    // Get schema files from temp directory
    const schemaDir = path.join(process.cwd(), 'schemaTypes');
    
    // Create schemaDir if it doesn't exist
    if (!fs.existsSync(schemaDir)) {
      fs.mkdirSync(schemaDir, { recursive: true });
    }

    // Copy schema files from the temp directory to schema directory
    const sourceDir = path.join(tempDir, 'schemas'); // Adjust according to your GitHub repo structure
    const files = fs.readdirSync(sourceDir);
    
    let updatedFiles = 0;
    
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        fs.copyFileSync(
          path.join(sourceDir, file),
          path.join(schemaDir, file)
        );
        updatedFiles++;
      }
    }

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Return success response
    res.status(200).json({
      success: true,
      message: `Successfully synced ${updatedFiles} schema files from GitHub`,
    });
  } catch (error) {
    console.error('Error syncing schemas:', error);
    
    // Return error response
    res.status(500).json({
      success: false,
      message: `Error syncing schemas: ${error.message}`,
    });
  }
} 