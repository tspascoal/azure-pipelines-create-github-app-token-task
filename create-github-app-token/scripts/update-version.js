#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Updates the VERSION constant in version.ts with the version from task.json
 * This script is run during the build process to ensure the user agent includes the correct version
 */

const taskJsonPath = path.join(__dirname, '..', 'task.json');
const versionPath = path.join(__dirname, '..', 'dist', 'src', 'utils', 'version.js');

try {
    // Read task.json to get the version
    const taskJsonContent = fs.readFileSync(taskJsonPath, 'utf8');
    console.log('Task.json file read successfully');
    
    let taskJson;
    try {
        taskJson = JSON.parse(taskJsonContent);
    } catch (parseError) {
        console.error('Error parsing task.json:');
        console.error('Parse error:', parseError.message);
        console.error('File content length:', taskJsonContent.length);
        console.error('Content around error position:');
        if (parseError.message.includes('position')) {
            const position = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0');
            const start = Math.max(0, position - 50);
            const end = Math.min(taskJsonContent.length, position + 50);
            console.error(taskJsonContent.substring(start, end));
        }
        process.exit(1);
    }
    
    const version = `${taskJson.version.Major}.${taskJson.version.Minor}.${taskJson.version.Patch}`;
    
    console.log(`Updating version to: ${version}`);
    
    // Check if the version file exists
    if (!fs.existsSync(versionPath)) {
        console.error(`Version file not found at: ${versionPath}`);
        console.error('Make sure to run TypeScript compilation first');
        process.exit(1);
    }
    
    // Read the compiled version.js file
    let versionContent = fs.readFileSync(versionPath, 'utf8');
    
    // Replace the VERSION export
    const versionRegex = /exports\.VERSION = ['"]dev['"];/;
    const replacement = `exports.VERSION = "${version}";`;
    
    if (!versionRegex.test(versionContent)) {
        console.error('Could not find VERSION export in version.js');
        console.error('Expected pattern: exports.VERSION = "dev";');
        process.exit(1);
    }
    
    versionContent = versionContent.replace(versionRegex, replacement);
    
    // Write the updated content back
    fs.writeFileSync(versionPath, versionContent, 'utf8');
    
    console.log('Version updated successfully in version.js');
    
} catch (error) {
    console.error('Error updating version:', error.message);
    process.exit(1);
}
