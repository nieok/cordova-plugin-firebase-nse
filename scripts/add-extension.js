const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    return new Promise((resolve, reject) => {
        const APP_BUNDLE_ID = 'com.weevi.lukasbbq'; 
        const EXT_BUNDLE_ID = 'com.weevi.lukasbbq.NotificationService'; 
        const TARGET_NAME = 'NotificationService';
        const TEAM_ID = '4R5NFLM5RY'; // From your logs

        const projectRoot = context.opts.projectRoot;
        const platformRoot = path.join(projectRoot, 'platforms', 'ios');

        let pluginDir = context.opts.plugin ? context.opts.plugin.dir : undefined;
        if (!pluginDir || typeof pluginDir !== 'string') {
            pluginDir = path.join(projectRoot, 'local-plugins', 'cordova-plugin-firebase-nse');
        }

        const projectFiles = fs.readdirSync(platformRoot).filter(file => file.endsWith('.xcodeproj'));
        if (projectFiles.length === 0) {
            return resolve(); // No project found, just move on
        }
        
        const projectPath = path.join(platformRoot, projectFiles[0], 'project.pbxproj');

        console.log(`[NSE Plugin] Opening project: ${projectPath}`);
        const myProj = xcode.project(projectPath);

        // Parsing is ASYNC, so we resolve/reject inside the callback
        myProj.parse(function (err) {
            if (err) {
                console.error('[NSE Plugin] Error parsing project:', err);
                return reject(err);
            }

            // 1. DUPLICATE CHECK
            if (myProj.pbxTargetByName(TARGET_NAME)) {
                console.log('[NSE Plugin] Target already exists. Skipping.');
                return resolve();
            }

            try {
                console.log('[NSE Plugin] Creating Notification Service Extension...');

                // 2. Create Target
                const target = myProj.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, EXT_BUNDLE_ID);
                const productFileRef = target.pbxNativeTarget.productReference;

                // 3. Copy Files
                const destFolder = path.join(platformRoot, TARGET_NAME);
                if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder);

                const sourceSwift = path.join(pluginDir, 'src', 'ios', 'NotificationService.swift');
                const sourcePlist = path.join(pluginDir, 'src', 'ios', 'Info.plist');
                
                fs.copyFileSync(sourceSwift, path.join(destFolder, 'NotificationService.swift'));
                fs.copyFileSync(sourcePlist, path.join(destFolder, 'Info.plist'));

                // 4. Add to Project
                const group = myProj.addPbxGroup(['NotificationService.swift', 'Info.plist'], TARGET_NAME, TARGET_NAME);
                const mainGroup = myProj.getFirstProject().firstProject.mainGroup;
                myProj.addToPbxGroup(group.uuid, mainGroup);

                myProj.addSourceFile('NotificationService.swift', { target: target.uuid }, group);

                // 5. Build Settings (Team ID hardcoded)
                const configurations = myProj.pbxXCBuildConfigurationSection();
                for (const key in configurations) {
                    const config = configurations[key];
                    if (typeof config === 'object' && config.buildSettings) {
                        if (config.buildSettings['PRODUCT_NAME'] === TARGET_NAME || config.buildSettings['PRODUCT_NAME'] === `"${TARGET_NAME}"`) {
                            config.buildSettings['INFOPLIST_FILE'] = `${TARGET_NAME}/Info.plist`;
                            config.buildSettings['PRODUCT_BUNDLE_IDENTIFIER'] = EXT_BUNDLE_ID;
                            config.buildSettings['DEVELOPMENT_TEAM'] = TEAM_ID; 
                            config.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.0';
                            config.buildSettings['TARGETED_DEVICE_FAMILY'] = '"1,2"';
                            config.buildSettings['SKIP_INSTALL'] = 'YES';
                            config.buildSettings['SWIFT_VERSION'] = '5.0';
                        }
                    }
                }

                // 6. Embed in Main App
                const mainTarget = myProj.getFirstTarget().firstTarget;
                myProj.addBuildPhase(
                    [productFileRef], 
                    'PBXCopyFilesBuildPhase', 
                    'Embed App Extensions', 
                    mainTarget.uuid, 
                    { dstSubfolderSpec: 13 } 
                );

                // 7. Write File (Sync)
                fs.writeFileSync(projectPath, myProj.writeSync());
                console.log('[NSE Plugin] Extension added successfully.');
                
                resolve(); // SUCCESS! Cordova can now proceed.
                
            } catch (e) {
                console.error('[NSE Plugin] Error during configuration:', e);
                reject(e);
            }
        });
    });
};