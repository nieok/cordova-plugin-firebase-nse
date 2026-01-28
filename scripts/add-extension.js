const xcode = require('xcode');
const fs = require('fs');
const path = require('path');

module.exports = function(context) {
    return new Promise((resolve, reject) => {
        // --- CONFIGURATION ---
        const APP_BUNDLE_ID = 'com.weevi.lukasbbq'; 
        const EXT_BUNDLE_ID = 'com.weevi.lukasbbq.NotificationService'; 
        const TARGET_NAME = 'NotificationService';
        const TEAM_ID = '4R5NFLM5RY'; 
        const DEPLOYMENT_TARGET = '13.0'; // Match your main app

        const projectRoot = context.opts.projectRoot;
        const platformRoot = path.join(projectRoot, 'platforms', 'ios');

        // 1. SMART PLUGIN DIR DETECTION (Handles GitHub vs Local)
        let pluginDir = context.opts.plugin ? context.opts.plugin.dir : undefined;
        if (!pluginDir || !fs.existsSync(pluginDir)) {
            const possiblePaths = [
                path.join(projectRoot, 'plugins', 'cordova-plugin-firebase-nse'),
                path.join(projectRoot, 'local-plugins', 'cordova-plugin-firebase-nse')
            ];
            pluginDir = possiblePaths.find(p => fs.existsSync(p));
        }

        if (!pluginDir) {
            console.error('[NSE] Could not find plugin directory. Check your folder structure.');
            return reject('Plugin directory not found');
        }

        // 2. FIND XCODE PROJECT
        const projectFiles = fs.readdirSync(platformRoot).filter(file => file.endsWith('.xcodeproj'));
        if (projectFiles.length === 0) return resolve();
        
        const projectPath = path.join(platformRoot, projectFiles[0], 'project.pbxproj');
        const myProj = xcode.project(projectPath);

        myProj.parse(function (err) {
            if (err) return reject(err);

            // 3. DUPLICATE PROTECTION (Fixes "Multiple Commands Produce" error)
            if (myProj.pbxTargetByName(TARGET_NAME)) {
                console.log(`[NSE] Target "${TARGET_NAME}" already exists. Skipping add to prevent build errors.`);
                return resolve();
            }

            try {
                console.log(`[NSE] Adding Extension Target: ${TARGET_NAME}`);

                // 4. CREATE TARGET
                const target = myProj.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, EXT_BUNDLE_ID);
                const productFileRef = target.pbxNativeTarget.productReference;

                // 5. COPY SOURCE FILES
                const destFolder = path.join(platformRoot, TARGET_NAME);
                if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder);

                const sourceSwift = path.join(pluginDir, 'src', 'ios', 'NotificationService.swift');
                const sourcePlist = path.join(pluginDir, 'src', 'ios', 'Info.plist');
                
                if (!fs.existsSync(sourceSwift)) throw new Error(`Missing source: ${sourceSwift}`);
                
                fs.copyFileSync(sourceSwift, path.join(destFolder, 'NotificationService.swift'));
                fs.copyFileSync(sourcePlist, path.join(destFolder, 'Info.plist'));

                // 6. ADD TO PROJECT STRUCTURE
                const group = myProj.addPbxGroup(['NotificationService.swift', 'Info.plist'], TARGET_NAME, TARGET_NAME);
                const mainGroup = myProj.getFirstProject().firstProject.mainGroup;
                myProj.addToPbxGroup(group.uuid, mainGroup);

                // Add source file to the new target
                myProj.addSourceFile('NotificationService.swift', { target: target.uuid }, group);

                // 7. CONFIGURE BUILD SETTINGS (Fixes Signing and Pod Errors)
                const configurations = myProj.pbxXCBuildConfigurationSection();
                for (const key in configurations) {
                    const config = configurations[key];
                    if (typeof config === 'object' && config.buildSettings) {
                        const prodName = config.buildSettings['PRODUCT_NAME'];
                        if (prodName === TARGET_NAME || prodName === `"${TARGET_NAME}"`) {
                            config.buildSettings['INFOPLIST_FILE'] = `${TARGET_NAME}/Info.plist`;
                            config.buildSettings['PRODUCT_BUNDLE_IDENTIFIER'] = EXT_BUNDLE_ID;
                            config.buildSettings['DEVELOPMENT_TEAM'] = TEAM_ID; 
                            config.buildSettings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET;
                            config.buildSettings['TARGETED_DEVICE_FAMILY'] = '"1,2"';
                            config.buildSettings['SKIP_INSTALL'] = 'YES';
                            config.buildSettings['SWIFT_VERSION'] = '5.0';
                            config.buildSettings['CODE_SIGN_STYLE'] = 'Automatic';
                            // Critical: prevent CocoaPods from getting confused by pathing
                            config.buildSettings['PRODUCT_MODULE_NAME'] = TARGET_NAME; 
                        }
                    }
                }

                // 8. EMBED IN MAIN APP
                const mainTarget = myProj.getFirstTarget().firstTarget;
                myProj.addBuildPhase(
                    [productFileRef], 
                    'PBXCopyFilesBuildPhase', 
                    'Embed App Extensions', 
                    mainTarget.uuid, 
                    'app_extension' // Uses the correct subfolder spec (13) automatically
                );

                // 9. CLEAN WRITE (Sync)
                fs.writeFileSync(projectPath, myProj.writeSync());
                console.log('[NSE] Project updated successfully.');
                
                // Small delay to ensure the OS releases the file lock before 'pod install' starts
                setTimeout(resolve, 500);
                
            } catch (e) {
                console.error('[NSE] Configuration failed:', e);
                reject(e);
            }
        });
    });
};