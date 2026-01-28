private func downloadImage(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { location, response, error in
            guard let location = location else {
                completion(nil)
                return
            }

            let tmpDir = URL(fileURLWithPath: NSTemporaryDirectory())
            
            // 1. Try to get the extension from the URL (e.g., "png", "jpg")
            var ext = url.pathExtension
            
            // 2. If the URL has no extension, default to "jpg" (safest fallback)
            if ext.isEmpty {
                ext = "jpg"
            }
            
            // 3. Create a unique filename WITH the correct extension
            let uniqueName = ProcessInfo.processInfo.globallyUniqueString + "." + ext
            let fileURL = tmpDir.appendingPathComponent(uniqueName)

            do {
                // 4. Move the file to the temp location
                try FileManager.default.moveItem(at: location, to: fileURL)
                
                // 5. Create the attachment
                // We pass typeHintKey to help iOS understand the file type if needed
                let options: [AnyHashable: Any] = [
                    UNNotificationAttachmentOptionsTypeHintKey: ext
                ]
                
                let attachment = try UNNotificationAttachment(
                    identifier: "image",
                    url: fileURL,
                    options: options
                )
                completion(attachment)
            } catch {
                print("Failed to attach image: \(error)")
                completion(nil)
            }
        }
        task.resume()
    }