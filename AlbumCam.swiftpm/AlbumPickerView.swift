//
//  AlbumPickerView.swift
//  AlbumCam
//
//  The album "dropdown": a dark sheet for choosing which album captured
//  photos are added to, with cover thumbnails, photo counts, the current
//  selection marked, and a way to create a new album. Selection is
//  persisted by PhotoLibraryService.
//

import SwiftUI
import UIKit

struct AlbumPickerView: View {
    @ObservedObject var library: PhotoLibraryService
    @Environment(\.dismiss) private var dismiss

    @State private var showingNewAlbum = false
    @State private var newAlbumName = ""

    private let accent = Solar.sunEdge

    var body: some View {
        NavigationStack {
            ZStack {
                Solar.space.ignoresSafeArea()
                List {
                    Section {
                        Button {
                            showingNewAlbum = true
                        } label: {
                            HStack(spacing: 14) {
                                iconTile(system: "plus")
                                Text("New Album…")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(accent)
                                Spacer()
                            }
                        }
                        .listRowBackground(Color.white.opacity(0.06))
                    }

                    Section {
                        if library.albums.isEmpty {
                            Text("No albums found.")
                                .foregroundStyle(.secondary)
                                .listRowBackground(Color.white.opacity(0.06))
                        }
                        ForEach(library.albums) { album in
                            Button {
                                library.selectedAlbumID = album.id
                                dismiss()
                            } label: {
                                AlbumRow(library: library, album: album,
                                         isSelected: album.id == library.selectedAlbumID,
                                         accent: accent)
                            }
                            .listRowBackground(Color.white.opacity(0.06))
                        }
                    } header: {
                        Text("Photos you take are added here")
                            .foregroundStyle(.secondary)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Save to Album")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }.foregroundStyle(accent)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { library.refreshAlbums() } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .foregroundStyle(.white)
                }
            }
            .alert("New Album", isPresented: $showingNewAlbum) {
                TextField("Album name", text: $newAlbumName)
                Button("Create") {
                    let name = newAlbumName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty else { return }
                    library.createAlbum(named: name) { _ in }
                    newAlbumName = ""
                    dismiss()
                }
                Button("Cancel", role: .cancel) { newAlbumName = "" }
            } message: {
                Text("Photos you take will be added here automatically.")
            }
        }
        .preferredColorScheme(.dark)
    }

    private func iconTile(system: String) -> some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(accent.opacity(0.18))
            .frame(width: 52, height: 52)
            .overlay(
                Image(systemName: system)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(accent)
            )
    }
}

/// One album row with an async-loaded cover thumbnail.
private struct AlbumRow: View {
    @ObservedObject var library: PhotoLibraryService
    let album: AlbumInfo
    let isSelected: Bool
    let accent: Color

    @State private var thumb: UIImage?

    var body: some View {
        HStack(spacing: 14) {
            thumbnail
            VStack(alignment: .leading, spacing: 2) {
                Text(album.title)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text("^[\(album.assetCount) photo](inflect: true)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(accent)
            }
        }
        .padding(.vertical, 2)
        .onAppear {
            guard thumb == nil else { return }
            library.loadThumbnail(for: album.id, size: 52) { thumb = $0 }
        }
    }

    private var thumbnail: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(Color.white.opacity(0.08))
            .frame(width: 52, height: 52)
            .overlay {
                if let thumb {
                    Image(uiImage: thumb)
                        .resizable()
                        .scaledToFill()
                } else {
                    Image(systemName: "photo.on.rectangle.angled")
                        .foregroundStyle(.secondary)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(.white.opacity(0.12), lineWidth: 1)
            )
    }
}
