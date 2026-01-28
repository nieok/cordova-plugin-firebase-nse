const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    const BUNDLE_ID = 'com.lukasbbq.app.NotificationService'; // <--- UPDATE THIS TO MATCH YOUR APP
    const TARGET_NAME = 'NotificationService';

    const projectRoot = context.opts.projectRoot;
    const platformRoot = path.join(projectRoot, 'platforms', 'ios');
    const pluginDir = context.opts.plugin.dir;

    const projectFiles = fs.readdirSync(platformRoot).filter(file => file.endsWith('.xcodeproj'));
    if (projectFiles.length === 0) return;
    
    const projectName = projectFiles[0].replace('.xcodeproj', '');
    const projectPath = path.join(platformRoot, projectFiles[0], 'project.pbxproj');

    console.log(`[NSE Plugin] Opening project: ${projectName}`);
    const myProj = xcode.project(projectPath);

    myProj.parse(function (err) {
        if (err) {
            console.error('[NSE Plugin] Error parsing project:', err);
            return;
        }

        // 1. Safety Check: If target exists, stop immediately to prevent "Duplicate Output" errors
        if (myProj.pbxTargetByName(TARGET_NAME)) {
            console.log('[NSE Plugin] Target already exists. Skipping script to prevent duplicates.');
            return;
        }

        console.log('[NSE Plugin] Creating Notification Service Extension...');

        // 2. Create the Target
        const target = myProj.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, BUNDLE_ID);

        // 3. Create Group and Copy Files
        const destFolder = path.join(platformRoot, TARGET_NAME);
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder);
        }

        const sourceSwift = path.join(pluginDir, 'src', 'ios', 'NotificationService.swift');
        const sourcePlist = path.join(pluginDir, 'src', 'ios', 'Info.plist');
        
        fs.copyFileSync(sourceSwift, path.join(destFolder, 'NotificationService.swift'));
        fs.copyFileSync(sourcePlist, path.join(destFolder, 'Info.plist'));

        // 4. Add Files to Project
        const group = myProj.addPbxGroup(
            ['NotificationService.swift', 'Info.plist'],
            TARGET_NAME,
            TARGET_NAME
        );
        const mainGroup = myProj.getFirstProject().firstProject.mainGroup;
        myProj.addToPbxGroup(group.uuid, mainGroup);

        // 5. Add Build Phase (Compile Swift)
        myProj.addSourceFile('NotificationService.swift', { target: target.uuid }, group);
        
        // IMPORTANT: Do NOT add Info.plist to "Copy Bundle Resources". 
        // It is referenced automatically by the target settings. Adding it causes "Duplicate output file".

        // 6. EMBED Extension into Main App (The Critical Link)
        // Find the Main App Target
        const mainTarget = myProj.getFirstTarget().firstTarget;
        
        console.log(`[NSE Plugin] Embedding extension into main target: ${mainTarget.productName}`);

        // Create a Copy Files phase for "Embed App Extensions" (Destination: 13)
        // We add the ProductFile (NotificationService.appex) to this phase
        myProj.addBuildPhase(
            [target.productReference], 
            'PBXCopyFilesBuildPhase', 
            'Embed App Extensions', 
            mainTarget.uuid, 
            { dstSubfolderSpec: 13 } // 13 = Plugins/Extensions folder
        );

        // 7. Save
        fs.writeFileSync(projectPath, myProj.writeSync());
        console.log('[NSE Plugin] Done. Project saved.');
    });
};