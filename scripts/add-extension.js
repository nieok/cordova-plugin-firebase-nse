const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    const APP_BUNDLE_ID = 'com.weevi.lukasbbq'; 
    const EXT_BUNDLE_ID = 'com.weevi.lukasbbq.NotificationService'; 
    const TARGET_NAME = 'NotificationService';

    const projectRoot = context.opts.projectRoot;
    const platformRoot = path.join(projectRoot, 'platforms', 'ios');

    // 1. Find Plugin Directory
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

        // Prevent duplicates
        if (myProj.pbxTargetByName(TARGET_NAME)) {
            console.log('[NSE Plugin] Target already exists. Skipping.');
            return;
        }

        // 2. Create the Extension Target
        const target = myProj.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, EXT_BUNDLE_ID);
        const productFileRef = target.pbxNativeTarget.productReference;

        // 3. Create Group and Copy Files
        const destFolder = path.join(platformRoot, TARGET_NAME);
        if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder);

        const sourceSwift = path.join(pluginDir, 'src', 'ios', 'NotificationService.swift');
        const sourcePlist = path.join(pluginDir, 'src', 'ios', 'Info.plist');
        
        fs.copyFileSync(sourceSwift, path.join(destFolder, 'NotificationService.swift'));
        fs.copyFileSync(sourcePlist, path.join(destFolder, 'Info.plist'));

        // 4. Add Files to Project Group
        const group = myProj.addPbxGroup(
            ['NotificationService.swift', 'Info.plist'],
            TARGET_NAME,
            TARGET_NAME
        );
        const mainGroup = myProj.getFirstProject().firstProject.mainGroup;
        myProj.addToPbxGroup(group.uuid, mainGroup);

        // 5. Add NotificationService.swift to "Compile Sources"
        myProj.addSourceFile('NotificationService.swift', { target: target.uuid }, group);

        // 6. CRITICAL: Set Build Settings (Info.plist, Bundle ID, Signing)
        // We iterate over all configurations (Debug, Release) for the new target
        const configurations = myProj.pbxXCBuildConfigurationSection();
        for (const key in configurations) {
            const config = configurations[key];
            if (typeof config === 'object' && config.buildSettings) {
                // Only modify the configs belonging to our new TARGET
                // (node-xcode doesn't make this easy, so we check if the config name is standard)
                // A safer way in node-xcode is using `updateBuildProperty` but that applies to everything.
                // We will use the specific API `addTargetAttribute` style logic below.
            }
        }

        // Simpler way: Use myProj.addBuildProperty to set it for the TARGET
        // "NotificationService" is the target name
        myProj.addBuildProperty('INFOPLIST_FILE', `${TARGET_NAME}/Info.plist`, TARGET_NAME);
        myProj.addBuildProperty('PRODUCT_BUNDLE_IDENTIFIER', EXT_BUNDLE_ID, TARGET_NAME);
        myProj.addBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', '13.0', TARGET_NAME);
        myProj.addBuildProperty('TARGETED_DEVICE_FAMILY', '"1,2"', TARGET_NAME);
        myProj.addBuildProperty('SKIP_INSTALL', 'YES', TARGET_NAME);
        myProj.addBuildProperty('SWIFT_VERSION', '5.0', TARGET_NAME);

        // 7. Embed Extension into Main App
        const mainTarget = myProj.getFirstTarget().firstTarget;
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