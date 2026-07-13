//
//  AlbumPickerView.swift
//  Roaster
//
//  Sheet for choosing which album captured photos are added to, and for
//  creating a new album on the fly. The selection is persisted by
//  PhotoLibraryService.
//

import SwiftUI

struct AlbumPickerView: View {
    @ObservedObject var library: PhotoLibraryService
    @Environment(\.dismiss) private var dismiss

    @State private var showingNewAlbum = false
    @State private var newAlbumName = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        showingNewAlbum = true
                    } label: {
                        Label("New Album…", systemImage: "plus.circle.fill")
                            .foregroundStyle(.yellow)
                    }
                }

                Section("Save new photos to") {
                    if library.albums.isEmpty {
                        Text("No albums found.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(library.albums) { album in
                        Button {
                            library.selectedAlbumID = album.id
                            dismiss()
                        } label: {
                            HStack {
                                Image(systemName: "rectangle.stack.fill")
                                    .foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(album.title)
                                        .foregroundStyle(.primary)
                                    Text("^[\(album.assetCount) photo](inflect: true)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if album.id == library.selectedAlbumID {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Destination Album")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        library.refreshAlbums()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
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
    }
}
