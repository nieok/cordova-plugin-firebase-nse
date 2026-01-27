import UserNotifications

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        self.bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttemptContent = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        // Firebase Console image support
        var imageURLString: String?

        if let fcmOptions = bestAttemptContent.userInfo["fcm_options"] as? [AnyHashable: Any] {
            imageURLString = fcmOptions["image"] as? String
        }

        if imageURLString == nil,
           let notification = bestAttemptContent.userInfo["notification"] as? [AnyHashable: Any] {
            imageURLString = notification["image"] as? String
        }

        guard let imageURL = imageURLString,
              let url = URL(string: imageURL) else {
            contentHandler(bestAttemptContent)
            return
        }

        downloadImage(from: url) { attachment in
            if let attachment = attachment {
                bestAttemptContent.attachments = [attachment]
            }
            contentHandler(bestAttemptContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler,
           let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    private func downloadImage(
        from url: URL,
        completion: @escaping (UNNotificationAttachment?) -> Void
    ) {
        let task = URLSession.shared.downloadTask(with: url) { tempURL, _, _ in
            guard let tempURL = tempURL else {
                completion(nil)
                return
            }

            let fileManager = FileManager.default
            let tmpDir = URL(fileURLWithPath: NSTemporaryDirectory())
            let fileURL = tmpDir.appendingPathComponent(url.lastPathComponent)

            try? fileManager.removeItem(at: fileURL)
            try? fileManager.moveItem(at: tempURL, to: fileURL)

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
