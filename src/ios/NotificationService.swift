import UserNotifications

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttemptContent = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        // 🔹 Firebase Console sends image via "image" or "imageUrl"
        let userInfo = bestAttemptContent.userInfo

        if let imageUrlString =
            userInfo["image"] as? String ??
            userInfo["imageUrl"] as? String,
           let imageUrl = URL(string: imageUrlString) {

            downloadImage(from: imageUrl) { attachment in
                if let attachment = attachment {
                    bestAttemptContent.attachments = [attachment]
                }
                contentHandler(bestAttemptContent)
            }
        } else {
            contentHandler(bestAttemptContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler,
           let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    private func downloadImage(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { location, _, _ in
            guard let location = location else {
                completion(nil)
                return
            }

            let tmpDir = URL(fileURLWithPath: NSTemporaryDirectory())
            let fileURL = tmpDir.appendingPathComponent(url.lastPathComponent)

            try? FileManager.default.moveItem(at: location, to: fileURL)

            let attachment = try? UNNotificationAttachment(
                identifier: "image",
                url: fileURL,
                options: nil
            )

            completion(attachment)
        }
        task.resume()
    }
}
