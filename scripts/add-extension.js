const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    const BUNDLE_ID = 'com.lukasbbq.app.NotificationService'; // <--- VERIFY THIS MATCHES YOUR APP
    const TARGET_NAME = 'NotificationService';

    const projectRoot = context.opts.projectRoot;
    const platformRoot = path.join(projectRoot, 'platforms', 'ios');

    // Robust Plugin Directory Finding
    // Sometimes context.opts.plugin is missing in hooks, so we fallback to manual path
    let pluginDir = context.opts.plugin ? context.opts.plugin.dir : undefined;
    if (!pluginDir || typeof pluginDir !== 'string') {
        pluginDir = path.join(projectRoot, 'local-plugins', 'cordova-plugin-firebase-nse');
    }

    console.log(`[NSE Plugin] using plugin directory: ${pluginDir}`);

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

        if (myProj.pbxTargetByName(TARGET_NAME)) {
            console.log('[NSE Plugin] Target already exists. Skipping.');
            return;
        }

        console.log('[NSE Plugin] Creating Notification Service Extension...');

        // 1. Create the Target
        const target = myProj.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, BUNDLE_ID);

        // 2. CRITICAL FIX: Get the Product File Reference correctly
        // node-xcode returns { uuid: ..., pbxNativeTarget: ... }
        // The actual .appex file reference is inside pbxNativeTarget.productReference
        const productFileRef = target.pbxNativeTarget.productReference;

        // 3. Create Group and Copy Files
        const destFolder = path.join(platformRoot, TARGET_NAME);
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder);
        }

        const sourceSwift = path.join(pluginDir, 'src', 'ios', 'NotificationService.swift');
        const sourcePlist = path.join(pluginDir, 'src', 'ios', 'Info.plist');
        
        // Safety check for source files
        if (!fs.existsSync(sourceSwift) || !fs.existsSync(sourcePlist)) {
             throw new Error(`[NSE Plugin] Source files missing at ${sourceSwift} or ${sourcePlist}`);
        }

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

        // 6. EMBED Extension into Main App
        const mainTarget = myProj.getFirstTarget().firstTarget;
        console.log(`[NSE Plugin] Embedding extension into main target: ${mainTarget.productName}`);

        // Use the 'productFileRef' we extracted earlier
        myProj.addBuildPhase(
            [productFileRef], 
            'PBXCopyFilesBuildPhase', 
            'Embed App Extensions', 
            mainTarget.uuid, 
            { dstSubfolderSpec: 13 } 
        );

        // 7. Save
        fs.writeFileSync(projectPath, myProj.writeSync());
        console.log('[NSE Plugin] Done. Project saved.');
    });
};