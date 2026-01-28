const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    const BUNDLE_ID = 'com.weevi.lukasbbq.NotificationService'; // <--- CHANGE THIS
    const TARGET_NAME = 'NotificationService';

    const projectRoot = context.opts.projectRoot;
    const platformRoot = path.join(projectRoot, 'platforms', 'ios');
    const pluginDir = context.opts.plugin.dir;

    // 1. Find the .xcodeproj file
    const projectFiles = fs.readdirSync(platformRoot).filter(file => file.endsWith('.xcodeproj'));
    if (projectFiles.length === 0) return;
    
    const projectName = projectFiles[0].replace('.xcodeproj', '');
    const projectPath = path.join(platformRoot, projectFiles[0], 'project.pbxproj');

    console.log(`[NSE Plugin] Found iOS project: ${projectName}`);

    const myProj = xcode.project(projectPath);

    myProj.parse(function (err) {
        if (err) {
            console.error('[NSE Plugin] Error parsing iOS project:', err);
            return;
        }

        // Check if target already exists to avoid duplicates
        if (myProj.pbxTargetByName(TARGET_NAME)) {
            console.log('[NSE Plugin] Target already exists. Skipping.');
            return;
        }

        console.log('[NSE Plugin] Creating Notification Service Extension...');

        // 2. Create the Target
        const target = myProj.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, BUNDLE_ID);

        // 3. Create Destination Folder in platforms/ios/NotificationService
        const destFolder = path.join(platformRoot, TARGET_NAME);
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder);
        }

        // 4. Copy Files from Plugin to Platform
        // We look for files in: /local-plugins/cordova-plugin-firebase-nse/src/ios/
        const sourceSwift = path.join(pluginDir, 'src', 'ios', 'NotificationService.swift');
        const sourcePlist = path.join(pluginDir, 'src', 'ios', 'Info.plist');
        
        const destSwift = path.join(destFolder, 'NotificationService.swift');
        const destPlist = path.join(destFolder, 'Info.plist');

        console.log('[NSE Plugin] Copying source files...');
        fs.copyFileSync(sourceSwift, destSwift);
        fs.copyFileSync(sourcePlist, destPlist);

        // 5. Add Files to Xcode Project
        // Create a group (folder representation in Xcode)
        const group = myProj.addPbxGroup(
            ['NotificationService.swift', 'Info.plist'],
            TARGET_NAME,
            TARGET_NAME
        );

        // Link the group to the main project
        const mainGroup = myProj.getFirstProject().firstProject.mainGroup;
        myProj.addToPbxGroup(group.uuid, mainGroup);

        // 6. Add Build Phase (Compile Swift file)
        myProj.addSourceFile('NotificationService.swift', { target: target.uuid }, group);

        // 7. Save Changes
        fs.writeFileSync(projectPath, myProj.writeSync());
        console.log('[NSE Plugin] Successfully injected Notification Service Extension!');
    });
};