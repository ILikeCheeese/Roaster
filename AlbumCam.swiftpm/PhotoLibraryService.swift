//
//  PhotoLibraryService.swift
//  Roaster
//
//  Handles Photos authorization, listing the user's albums, creating new
//  albums, saving captured photos into a chosen album, and remembering
//  that choice across launches via UserDefaults.
//

import Photos
import UIKit

struct AlbumInfo: Identifiable, Hashable {
    let id: String              // PHAssetCollection.localIdentifier
    let title: String
    let assetCount: Int
}

@MainActor
final class PhotoLibraryService: ObservableObject {

    enum SaveResult {
        case success(albumTitle: String)
        case noPermission
        case albumMissing
        case failed(String)
    }

    @Published var albums: [AlbumInfo] = []
    @Published var authorized = false
    /// The album new photos are added to. Persisted across sessions.
    @Published var selectedAlbumID: String? {
        didSet { persistSelection() }
    }
    @Published var lastSaveMessage: String?

    private let defaultsKey = "albumcam.selectedAlbumID"

    init() {
        selectedAlbumID = UserDefaults.standard.string(forKey: defaultsKey)
    }

    var selectedAlbumTitle: String? {
        guard let id = selectedAlbumID else { return nil }
        return albums.first(where: { $0.id == id })?.title
    }

    private func persistSelection() {
        let defaults = UserDefaults.standard
        if let id = selectedAlbumID {
            defaults.set(id, forKey: defaultsKey)
        } else {
            defaults.removeObject(forKey: defaultsKey)
        }
    }

    // MARK: - Authorization

    func requestAuthorization() {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch status {
        case .authorized, .limited:
            authorized = true
            refreshAlbums()
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] newStatus in
                Task { @MainActor in
                    self?.authorized = (newStatus == .authorized || newStatus == .limited)
                    if self?.authorized == true { self?.refreshAlbums() }
                }
            }
        default:
            authorized = false
        }
    }

    // MARK: - Album listing

    func refreshAlbums() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            var found: [AlbumInfo] = []

            let options = PHFetchOptions()
            options.sortDescriptors = [NSSortDescriptor(key: "localizedTitle", ascending: true)]

            // User-created albums.
            let userAlbums = PHAssetCollection.fetchAssetCollections(
                with: .album, subtype: .any, options: options
            )
            userAlbums.enumerateObjects { collection, _, _ in
                let count = PHAsset.fetchAssets(in: collection, options: nil).count
                found.append(AlbumInfo(
                    id: collection.localIdentifier,
                    title: collection.localizedTitle ?? "Untitled",
                    assetCount: count
                ))
            }

            // "Recents" smart album, offered as a convenient default target.
            let smart = PHAssetCollection.fetchAssetCollections(
                with: .smartAlbum, subtype: .smartAlbumUserLibrary, options: nil
            )
            smart.enumerateObjects { collection, _, _ in
                let count = PHAsset.fetchAssets(in: collection, options: nil).count
                found.insert(AlbumInfo(
                    id: collection.localIdentifier,
                    title: collection.localizedTitle ?? "Recents",
                    assetCount: count
                ), at: 0)
            }

            Task { @MainActor in
                self.albums = found
                // If the remembered album no longer exists, clear it.
                if let id = self.selectedAlbumID,
                   !found.contains(where: { $0.id == id }) {
                    self.selectedAlbumID = nil
                }
            }
        }
    }

    // MARK: - Album creation

    func createAlbum(named name: String, completion: @escaping (Bool) -> Void) {
        var placeholder: PHObjectPlaceholder?
        PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: name)
            placeholder = request.placeholderForCreatedAssetCollection
        } completionHandler: { [weak self] success, _ in
            Task { @MainActor in
                if success, let id = placeholder?.localIdentifier {
                    self?.selectedAlbumID = id
                    self?.refreshAlbums()
                }
                completion(success)
            }
        }
    }

    // MARK: - Saving

    func save(image: UIImage, completion: @escaping (SaveResult) -> Void) {
        guard authorized else {
            completion(.noPermission)
            return
        }

        // No album chosen yet — fall back to the camera roll.
        guard let albumID = selectedAlbumID,
              let collection = fetchCollection(id: albumID) else {
            saveToCameraRoll(image: image, completion: completion)
            return
        }

        PHPhotoLibrary.shared().performChanges {
            let creation = PHAssetChangeRequest.creationRequestForAsset(from: image)
            guard let placeholder = creation.placeholderForCreatedAsset,
                  let albumChange = PHAssetCollectionChangeRequest(for: collection) else {
                return
            }
            albumChange.addAssets([placeholder] as NSArray)
        } completionHandler: { success, error in
            Task { @MainActor in
                if success {
                    let title = self.albums.first(where: { $0.id == albumID })?.title ?? "album"
                    completion(.success(albumTitle: title))
                } else {
                    completion(.failed(error?.localizedDescription ?? "Unknown error"))
                }
            }
        }
    }

    private func saveToCameraRoll(image: UIImage, completion: @escaping (SaveResult) -> Void) {
        PHPhotoLibrary.shared().performChanges {
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        } completionHandler: { success, error in
            Task { @MainActor in
                if success {
                    completion(.success(albumTitle: "Camera Roll"))
                } else {
                    completion(.failed(error?.localizedDescription ?? "Unknown error"))
                }
            }
        }
    }

    private func fetchCollection(id: String) -> PHAssetCollection? {
        PHAssetCollection.fetchAssetCollections(
            withLocalIdentifiers: [id], options: nil
        ).firstObject
    }

    // MARK: - Thumbnails

    /// Loads the newest photo in an album as a small cover thumbnail.
    func loadThumbnail(for albumID: String, size: CGFloat,
                       completion: @escaping (UIImage?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard let collection = PHAssetCollection.fetchAssetCollections(
                withLocalIdentifiers: [albumID], options: nil).firstObject else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let options = PHFetchOptions()
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            options.fetchLimit = 1
            guard let asset = PHAsset.fetchAssets(in: collection, options: options).firstObject else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let request = PHImageRequestOptions()
            request.deliveryMode = .opportunistic
            request.resizeMode = .fast
            request.isNetworkAccessAllowed = true
            let target = CGSize(width: size * 3, height: size * 3)   // ~@3x
            PHImageManager.default().requestImage(
                for: asset, targetSize: target, contentMode: .aspectFill, options: request
            ) { image, _ in
                DispatchQueue.main.async { completion(image) }
            }
        }
    }
}
