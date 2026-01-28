const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    const APP_BUNDLE_ID = 'com.weevi.lukasbbq'; 
    const EXT_BUNDLE_ID = 'com.weevi.lukasbbq.NotificationService'; 
    const TARGET_NAME = 'NotificationService';
    
    // FROM YOUR LOGS
    const TEAM_ID = '4R5NFLM5RY'; 

    const projectRoot = context.opts.projectRoot;
    const platformRoot = path.join(projectRoot, 'platforms', 'ios');

    // Find Plugin Directory
    let pluginDir = context.opts.plugin ? context.opts.plugin.dir : undefined;
    if (!pluginDir || typeof pluginDir !== 'string') {
        pluginDir = path.join(projectRoot, 'local-plugins', 'cordova-plugin-firebase-nse');
    }

    const projectFiles = fs.readdirSync(platformRoot).filter(file => file.endsWith('.xcodeproj'));
    if (projectFiles.length === 0) return;
    const projectPath = path.join(platformRoot, projectFiles[0], 'project.pbxproj');

    console.log(`[NSE Plugin] Opening project: ${projectPath}`);
    const myProj = xcode.project(projectPath);

    myProj.parse(function (err) {
        if (err) return;

        // 1. DUPLICATE CHECK (Prevent "Multiple commands produce" error)
        if (myProj.pbxTargetByName(TARGET_NAME)) {
            console.log('[NSE Plugin] Target already exists. Skipping to prevent duplicates.');
            return;
        }

        console.log('[NSE Plugin] Creating Notification Service Extension...');

        // 2. Create Target
        const target = myProj.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, EXT_BUNDLE_ID);
        const productFileRef = target.pbxNativeTarget.productReference;

        // 3. Create Group & Copy Files
        const destFolder = path.join(platformRoot, TARGET_NAME);
        if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder);

        const sourceSwift = path.join(pluginDir, 'src', 'ios', 'NotificationService.swift');
        const sourcePlist = path.join(pluginDir, 'src', 'ios', 'Info.plist');
        
        fs.copyFileSync(sourceSwift, path.join(destFolder, 'NotificationService.swift'));
        fs.copyFileSync(sourcePlist, path.join(destFolder, 'Info.plist'));

        const group = myProj.addPbxGroup(['NotificationService.swift', 'Info.plist'], TARGET_NAME, TARGET_NAME);
        const mainGroup = myProj.getFirstProject().firstProject.mainGroup;
        myProj.addToPbxGroup(group.uuid, mainGroup);

        // 4. Add to Compile Sources
        myProj.addSourceFile('NotificationService.swift', { target: target.uuid }, group);

        // 5. CRITICAL: Inject Build Settings (Team ID & Profile)
        // We configure this DIRECTLY in the project file to satisfy Xcode's initial checks
        const configurations = myProj.pbxXCBuildConfigurationSection();
        for (const key in configurations) {
            const config = configurations[key];
            if (typeof config === 'object' && config.buildSettings) {
                // Apply to the EXTENSION Target
                // node-xcode makes mapping configs to targets hard, so we apply to any config 
                // that matches our new target's product name.
                if (config.buildSettings['PRODUCT_NAME'] === TARGET_NAME || config.buildSettings['PRODUCT_NAME'] === `"${TARGET_NAME}"`) {
                    console.log(`[NSE Plugin] Updating build settings for config: ${config.name}`);
                    
                    config.buildSettings['INFOPLIST_FILE'] = `${TARGET_NAME}/Info.plist`;
                    config.buildSettings['PRODUCT_BUNDLE_IDENTIFIER'] = EXT_BUNDLE_ID;
                    config.buildSettings['DEVELOPMENT_TEAM'] = TEAM_ID; // <--- FIXES SIGNING ERROR
                    config.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.0';
                    config.buildSettings['TARGETED_DEVICE_FAMILY'] = '"1,2"';
                    config.buildSettings['SKIP_INSTALL'] = 'YES';
                    config.buildSettings['SWIFT_VERSION'] = '5.0';
                    // We don't set PROVISIONING_PROFILE here because build.json handles the UUID mapping
                    // But Team ID is required early.
                }
            }
        }

        // 6. Embed in Main App
        const mainTarget = myProj.getFirstTarget().firstTarget;
        console.log(`[NSE Plugin] Embedding into main app: ${mainTarget.productName}`);
        
        myProj.addBuildPhase(
            [productFileRef], 
            'PBXCopyFilesBuildPhase', 
            'Embed App Extensions', 
            mainTarget.uuid, 
            { dstSubfolderSpec: 13 } 
        );

        fs.writeFileSync(projectPath, myProj.writeSync());
        console.log('[NSE Plugin] Extension added successfully.');
    });
};