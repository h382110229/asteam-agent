import asar from '@electron/asar';
import fs from 'fs';
import path from 'path';

const targetAsar = 'D:\\ASTeamAgentClient\\ASTeam\\ASTeam Agent\\resources\\app.asar';
const tempDir = path.resolve('temp_asar');
const tempAsar = path.resolve('temp_asar.asar');

async function main() {
  console.log('1. Extracting existing app.asar...');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  asar.extractAll(targetAsar, tempDir);

  console.log('2. Copying built dist, dist-electron and skills to temp_asar...');
  fs.cpSync(path.resolve('dist'), path.join(tempDir, 'dist'), { recursive: true, force: true });
  fs.cpSync(path.resolve('dist-electron'), path.join(tempDir, 'dist-electron'), { recursive: true, force: true });
  if (fs.existsSync(path.resolve('skills'))) {
    fs.cpSync(path.resolve('skills'), path.join(tempDir, 'skills'), { recursive: true, force: true });
  }
  fs.copyFileSync(path.resolve('package.json'), path.join(tempDir, 'package.json'));

  console.log('3. Packing temp_asar.asar...');
  await asar.createPackage(tempDir, tempAsar);

  console.log('4. Copying to target app.asar...');
  try {
    fs.copyFileSync(tempAsar, targetAsar);
    console.log('✓ Successfully hot-updated', targetAsar);
  } catch (err) {
    console.error('Failed to overwrite target app.asar directly (likely locked by running process):', err.message);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (fs.existsSync(tempAsar)) {
      fs.rmSync(tempAsar, { force: true });
    }
  }
}

main().catch(console.error);
