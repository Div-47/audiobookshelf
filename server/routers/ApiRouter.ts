const express = require('express')
const Path = require('path')
const sequelize = require('sequelize')

const Logger = require('../Logger')
const Database = require('../Database')
const SocketAuthority = require('../SocketAuthority')

const fs = require('../libs/fsExtra')
const date = require('../libs/dateAndTime')

const CacheManager = require('../managers/CacheManager')
const RssFeedManager = require('../managers/RssFeedManager')

const LibraryController = require('../controllers/LibraryController')
const UserController = require('../controllers/UserController')
const CollectionController = require('../controllers/CollectionController')
const PlaylistController = require('../controllers/PlaylistController')
const MeController = require('../controllers/MeController')
const BackupController = require('../controllers/BackupController')
const LibraryItemController = require('../controllers/LibraryItemController')
const SeriesController = require('../controllers/SeriesController')
const FileSystemController = require('../controllers/FileSystemController')
const AuthorController = require('../controllers/AuthorController')
const SessionController = require('../controllers/SessionController')
const PodcastController = require('../controllers/PodcastController')
const NotificationController = require('../controllers/NotificationController')
const EmailController = require('../controllers/EmailController')
const SearchController = require('../controllers/SearchController')
const CacheController = require('../controllers/CacheController')
const ToolsController = require('../controllers/ToolsController')
const RSSFeedController = require('../controllers/RSSFeedController')
const CustomMetadataProviderController = require('../controllers/CustomMetadataProviderController')
const MiscController = require('../controllers/MiscController')
const ShareController = require('../controllers/ShareController')
const StatsController = require('../controllers/StatsController')
const ApiKeyController = require('../controllers/ApiKeyController')

class ApiRouter {
  auth: any
  playbackSessionManager: any
  abMergeManager: any
  backupManager: any
  podcastManager: any
  audioMetadataManager: any
  cronManager: any
  emailManager: any
  apiCacheManager: any
  router: any

  constructor(Server: any) {
    this.auth = Server.auth
    this.playbackSessionManager = Server.playbackSessionManager
    this.abMergeManager = Server.abMergeManager
    this.backupManager = Server.backupManager
    this.podcastManager = Server.podcastManager
    this.audioMetadataManager = Server.audioMetadataManager
    this.cronManager = Server.cronManager
    this.emailManager = Server.emailManager
    this.apiCacheManager = Server.apiCacheManager

    this.router = express()
    this.router.disable('x-powered-by')
    this.init()
  }

  init(): void {
    const self = this as any

    //
    // Library Routes
    //
    this.router.get(/^\/libraries/, this.apiCacheManager.middleware)
    this.router.post('/libraries', LibraryController.create.bind(self))
    this.router.get('/libraries', LibraryController.findAll.bind(self))
    this.router.get('/libraries/:id', LibraryController.middleware.bind(self), LibraryController.findOne.bind(self))
    this.router.patch('/libraries/:id', LibraryController.middleware.bind(self), LibraryController.update.bind(self))
    this.router.delete('/libraries/:id', LibraryController.middleware.bind(self), LibraryController.delete.bind(self))

    this.router.get('/libraries/:id/items', LibraryController.middleware.bind(self), LibraryController.getLibraryItems.bind(self))
    this.router.delete('/libraries/:id/issues', LibraryController.middleware.bind(self), LibraryController.removeLibraryItemsWithIssues.bind(self))
    this.router.get('/libraries/:id/episode-downloads', LibraryController.middleware.bind(self), LibraryController.getEpisodeDownloadQueue.bind(self))
    this.router.get('/libraries/:id/series', LibraryController.middleware.bind(self), LibraryController.getAllSeriesForLibrary.bind(self))
    this.router.get('/libraries/:id/series/:seriesId', LibraryController.middleware.bind(self), LibraryController.getSeriesForLibrary.bind(self))
    this.router.get('/libraries/:id/collections', LibraryController.middleware.bind(self), LibraryController.getCollectionsForLibrary.bind(self))
    this.router.get('/libraries/:id/playlists', LibraryController.middleware.bind(self), LibraryController.getUserPlaylistsForLibrary.bind(self))
    this.router.get('/libraries/:id/personalized', LibraryController.middleware.bind(self), LibraryController.getUserPersonalizedShelves.bind(self))
    this.router.get('/libraries/:id/filterdata', LibraryController.middleware.bind(self), LibraryController.getLibraryFilterData.bind(self))
    this.router.get('/libraries/:id/search', LibraryController.middleware.bind(self), LibraryController.search.bind(self))
    this.router.get('/libraries/:id/stats', LibraryController.middleware.bind(self), LibraryController.stats.bind(self))
    this.router.get('/libraries/:id/authors', LibraryController.middleware.bind(self), LibraryController.getAuthors.bind(self))
    this.router.get('/libraries/:id/narrators', LibraryController.middleware.bind(self), LibraryController.getNarrators.bind(self))
    this.router.patch('/libraries/:id/narrators/:narratorId', LibraryController.middleware.bind(self), LibraryController.updateNarrator.bind(self))
    this.router.delete('/libraries/:id/narrators/:narratorId', LibraryController.middleware.bind(self), LibraryController.removeNarrator.bind(self))
    this.router.get('/libraries/:id/matchall', LibraryController.middleware.bind(self), LibraryController.matchAll.bind(self))
    this.router.post('/libraries/:id/scan', LibraryController.middleware.bind(self), LibraryController.scan.bind(self))
    this.router.get('/libraries/:id/recent-episodes', LibraryController.middleware.bind(self), LibraryController.getRecentEpisodes.bind(self))
    this.router.get('/libraries/:id/opml', LibraryController.middleware.bind(self), LibraryController.getOPMLFile.bind(self))
    this.router.post('/libraries/order', LibraryController.reorder.bind(self))
    this.router.post('/libraries/:id/remove-metadata', LibraryController.middleware.bind(self), LibraryController.removeAllMetadataFiles.bind(self))
    this.router.get('/libraries/:id/podcast-titles', LibraryController.middleware.bind(self), LibraryController.getPodcastTitles.bind(self))
    this.router.get('/libraries/:id/download', LibraryController.middleware.bind(self), LibraryController.downloadMultiple.bind(self))

    //
    // Item Routes
    //
    this.router.post('/items/batch/delete', LibraryItemController.batchDelete.bind(self))
    this.router.post('/items/batch/update', LibraryItemController.batchUpdate.bind(self))
    this.router.post('/items/batch/get', LibraryItemController.batchGet.bind(self))
    this.router.post('/items/batch/quickmatch', LibraryItemController.batchQuickMatch.bind(self))
    this.router.post('/items/batch/scan', LibraryItemController.batchScan.bind(self))

    this.router.get('/items/:id', LibraryItemController.middleware.bind(self), LibraryItemController.findOne.bind(self))
    this.router.delete('/items/:id', LibraryItemController.middleware.bind(self), LibraryItemController.delete.bind(self))
    this.router.get('/items/:id/download', LibraryItemController.middleware.bind(self), LibraryItemController.download.bind(self))
    this.router.patch('/items/:id/media', LibraryItemController.middleware.bind(self), LibraryItemController.updateMedia.bind(self))
    this.router.get('/items/:id/cover', LibraryItemController.getCover.bind(self))
    this.router.post('/items/:id/cover', LibraryItemController.middleware.bind(self), LibraryItemController.uploadCover.bind(self))
    this.router.patch('/items/:id/cover', LibraryItemController.middleware.bind(self), LibraryItemController.updateCover.bind(self))
    this.router.delete('/items/:id/cover', LibraryItemController.middleware.bind(self), LibraryItemController.removeCover.bind(self))
    this.router.post('/items/:id/match', LibraryItemController.middleware.bind(self), LibraryItemController.match.bind(self))
    this.router.post('/items/:id/play', LibraryItemController.middleware.bind(self), LibraryItemController.startPlaybackSession.bind(self))
    this.router.post('/items/:id/play/:episodeId', LibraryItemController.middleware.bind(self), LibraryItemController.startEpisodePlaybackSession.bind(self))
    this.router.patch('/items/:id/tracks', LibraryItemController.middleware.bind(self), LibraryItemController.updateTracks.bind(self))
    this.router.post('/items/:id/scan', LibraryItemController.middleware.bind(self), LibraryItemController.scan.bind(self))
    this.router.get('/items/:id/metadata-object', LibraryItemController.middleware.bind(self), LibraryItemController.getMetadataObject.bind(self))
    this.router.post('/items/:id/chapters', LibraryItemController.middleware.bind(self), LibraryItemController.updateMediaChapters.bind(self))
    this.router.get('/items/:id/ffprobe/:fileid', LibraryItemController.middleware.bind(self), LibraryItemController.getFFprobeData.bind(self))
    this.router.get('/items/:id/file/:fileid', LibraryItemController.middleware.bind(self), LibraryItemController.getLibraryFile.bind(self))
    this.router.delete('/items/:id/file/:fileid', LibraryItemController.middleware.bind(self), LibraryItemController.deleteLibraryFile.bind(self))
    this.router.get('/items/:id/file/:fileid/download', LibraryItemController.middleware.bind(self), LibraryItemController.downloadLibraryFile.bind(self))
    this.router.get('/items/:id/ebook/:fileid?', LibraryItemController.middleware.bind(self), LibraryItemController.getEBookFile.bind(self))
    this.router.patch('/items/:id/ebook/:fileid/status', LibraryItemController.middleware.bind(self), LibraryItemController.updateEbookFileStatus.bind(self))

    //
    // User Routes
    //
    this.router.post('/users', UserController.middleware.bind(self), UserController.create.bind(self))
    this.router.get('/users', UserController.middleware.bind(self), UserController.findAll.bind(self))
    this.router.get('/users/online', UserController.getOnlineUsers.bind(self))
    this.router.get('/users/:id', UserController.middleware.bind(self), UserController.findOne.bind(self))
    this.router.patch('/users/:id', UserController.middleware.bind(self), UserController.update.bind(self))
    this.router.delete('/users/:id', UserController.middleware.bind(self), UserController.delete.bind(self))
    this.router.patch('/users/:id/openid-unlink', UserController.middleware.bind(self), UserController.unlinkFromOpenID.bind(self))
    this.router.get('/users/:id/listening-sessions', UserController.middleware.bind(self), UserController.getListeningSessions.bind(self))
    this.router.get('/users/:id/listening-stats', UserController.middleware.bind(self), UserController.getListeningStats.bind(self))

    //
    // Collection Routes
    //
    this.router.post('/collections', CollectionController.middleware.bind(self), CollectionController.create.bind(self))
    this.router.get('/collections', CollectionController.findAll.bind(self))
    this.router.get('/collections/:id', CollectionController.middleware.bind(self), CollectionController.findOne.bind(self))
    this.router.patch('/collections/:id', CollectionController.middleware.bind(self), CollectionController.update.bind(self))
    this.router.delete('/collections/:id', CollectionController.middleware.bind(self), CollectionController.delete.bind(self))
    this.router.post('/collections/:id/book', CollectionController.middleware.bind(self), CollectionController.addBook.bind(self))
    this.router.delete('/collections/:id/book/:bookId', CollectionController.middleware.bind(self), CollectionController.removeBook.bind(self))
    this.router.post('/collections/:id/batch/add', CollectionController.middleware.bind(self), CollectionController.addBatch.bind(self))
    this.router.post('/collections/:id/batch/remove', CollectionController.middleware.bind(self), CollectionController.removeBatch.bind(self))

    //
    // Playlist Routes
    //
    this.router.post('/playlists', PlaylistController.create.bind(self))
    this.router.get('/playlists', PlaylistController.findAllForUser.bind(self))
    this.router.get('/playlists/:id', PlaylistController.middleware.bind(self), PlaylistController.findOne.bind(self))
    this.router.patch('/playlists/:id', PlaylistController.middleware.bind(self), PlaylistController.update.bind(self))
    this.router.delete('/playlists/:id', PlaylistController.middleware.bind(self), PlaylistController.delete.bind(self))
    this.router.post('/playlists/:id/item', PlaylistController.middleware.bind(self), PlaylistController.addItem.bind(self))
    this.router.delete('/playlists/:id/item/:libraryItemId/:episodeId?', PlaylistController.middleware.bind(self), PlaylistController.removeItem.bind(self))
    this.router.post('/playlists/:id/batch/add', PlaylistController.middleware.bind(self), PlaylistController.addBatch.bind(self))
    this.router.post('/playlists/:id/batch/remove', PlaylistController.middleware.bind(self), PlaylistController.removeBatch.bind(self))
    this.router.post('/playlists/collection/:collectionId', PlaylistController.createFromCollection.bind(self))

    //
    // Current User Routes (Me)
    //
    this.router.get('/me', MeController.getCurrentUser.bind(self))
    this.router.get('/me/sessions', MeController.getSessions.bind(self))
    this.router.delete('/me/sessions/:id', MeController.deleteSession.bind(self))
    this.router.get('/me/progress', MeController.getAllMediaProgress.bind(self))
    this.router.get('/me/bookmarks', MeController.getAllBookmarks.bind(self))
    this.router.get('/me/bookmarks/:libraryItemId', MeController.getBookmarksForLibraryItem.bind(self))
    this.router.get('/me/listening-sessions', MeController.getListeningSessions.bind(self))
    this.router.get('/me/item/listening-sessions/:libraryItemId/:episodeId?', MeController.getItemListeningSessions.bind(self))
    this.router.get('/me/listening-stats', MeController.getListeningStats.bind(self))
    this.router.get('/me/progress/:id/remove-from-continue-listening', MeController.removeItemFromContinueListening.bind(self))
    this.router.get('/me/progress/:id/:episodeId?', MeController.getMediaProgress.bind(self))
    this.router.patch('/me/progress/batch/update', MeController.batchUpdateMediaProgress.bind(self))
    this.router.patch('/me/progress/:libraryItemId/:episodeId?', MeController.createUpdateMediaProgress.bind(self))
    this.router.delete('/me/progress/:id', MeController.removeMediaProgress.bind(self))
    this.router.post('/me/item/:id/bookmark', MeController.createBookmark.bind(self))
    this.router.patch('/me/item/:id/bookmark', MeController.updateBookmark.bind(self))
    this.router.delete('/me/item/:id/bookmark/:time', MeController.removeBookmark.bind(self))
    this.router.patch('/me/password', this.auth.authRateLimiter, MeController.updatePassword.bind(self))
    this.router.get('/me/items-in-progress', MeController.getAllLibraryItemsInProgress.bind(self))
    this.router.get('/me/series/:id/remove-from-continue-listening', MeController.removeSeriesFromContinueListening.bind(self))
    this.router.get('/me/series/:id/readd-to-continue-listening', MeController.readdSeriesFromContinueListening.bind(self))
    this.router.get('/me/stats/year/:year', MeController.getStatsForYear.bind(self))
    this.router.post('/me/ereader-devices', MeController.updateUserEReaderDevices.bind(self))

    //
    // Backup Routes
    //
    this.router.get('/backups', BackupController.middleware.bind(self), BackupController.getAll.bind(self))
    this.router.post('/backups', BackupController.middleware.bind(self), BackupController.create.bind(self))
    this.router.delete('/backups/:id', BackupController.middleware.bind(self), BackupController.delete.bind(self))
    this.router.get('/backups/:id/download', BackupController.middleware.bind(self), BackupController.download.bind(self))
    this.router.get('/backups/:id/apply', BackupController.middleware.bind(self), BackupController.apply.bind(self))
    this.router.post('/backups/upload', BackupController.middleware.bind(self), BackupController.upload.bind(self))
    this.router.patch('/backups/path', BackupController.middleware.bind(self), BackupController.updatePath.bind(self))

    //
    // File System Routes
    //
    this.router.get('/filesystem', FileSystemController.getPaths.bind(self))
    this.router.post('/filesystem/pathexists', FileSystemController.checkPathExists.bind(self))

    //
    // Author Routes
    //
    this.router.get('/authors/:id', AuthorController.middleware.bind(self), AuthorController.findOne.bind(self))
    this.router.patch('/authors/:id', AuthorController.middleware.bind(self), AuthorController.update.bind(self))
    this.router.delete('/authors/:id', AuthorController.middleware.bind(self), AuthorController.delete.bind(self))
    this.router.post('/authors/:id/match', AuthorController.match.bind(self))
    this.router.get('/authors/:id/image', AuthorController.getImage.bind(self))
    this.router.post('/authors/:id/image', AuthorController.middleware.bind(self), AuthorController.uploadImage.bind(self))
    this.router.delete('/authors/:id/image', AuthorController.deleteImage.bind(self))

    //
    // Series Routes
    //
    this.router.get('/series/:id', SeriesController.middleware.bind(self), SeriesController.findOne.bind(self))
    this.router.patch('/series/:id', SeriesController.middleware.bind(self), SeriesController.update.bind(self))

    //
    // Playback Session Routes
    //
    this.router.get('/sessions', SessionController.getAllWithUserData.bind(self))
    this.router.delete('/sessions/:id', SessionController.middleware.bind(self), SessionController.delete.bind(self))
    this.router.get('/sessions/open', SessionController.getOpenSessions.bind(self))
    this.router.post('/sessions/batch/delete', SessionController.batchDelete.bind(self))
    this.router.post('/session/local', SessionController.syncLocal.bind(self))
    this.router.post('/session/local-all', SessionController.syncLocalSessions.bind(self))
    // TODO: Update these endpoints because they are only for open playback sessions
    this.router.get('/session/:id', SessionController.openSessionMiddleware.bind(self), SessionController.getOpenSession.bind(self))
    this.router.post('/session/:id/sync', SessionController.openSessionMiddleware.bind(self), SessionController.sync.bind(self))
    this.router.post('/session/:id/close', SessionController.openSessionMiddleware.bind(self), SessionController.close.bind(self))

    //
    // Podcast Routes
    //
    this.router.post('/podcasts', PodcastController.create.bind(self))
    this.router.post('/podcasts/feed', PodcastController.getPodcastFeed.bind(self))
    this.router.post('/podcasts/opml/parse', PodcastController.getFeedsFromOPMLText.bind(self))
    this.router.post('/podcasts/opml/create', PodcastController.bulkCreatePodcastsFromOpmlFeedUrls.bind(self))
    this.router.get('/podcasts/:id/checknew', PodcastController.middleware.bind(self), PodcastController.checkNewEpisodes.bind(self))
    this.router.get('/podcasts/:id/downloads', PodcastController.middleware.bind(self), PodcastController.getEpisodeDownloads.bind(self))
    this.router.get('/podcasts/:id/clear-queue', PodcastController.middleware.bind(self), PodcastController.clearEpisodeDownloadQueue.bind(self))
    this.router.get('/podcasts/:id/search-episode', PodcastController.middleware.bind(self), PodcastController.findEpisode.bind(self))
    this.router.post('/podcasts/:id/download-episodes', PodcastController.middleware.bind(self), PodcastController.downloadEpisodes.bind(self))
    this.router.post('/podcasts/:id/match-episodes', PodcastController.middleware.bind(self), PodcastController.quickMatchEpisodes.bind(self))
    this.router.get('/podcasts/:id/episode/:episodeId', PodcastController.middleware.bind(self), PodcastController.getEpisode.bind(self))
    this.router.patch('/podcasts/:id/episode/:episodeId', PodcastController.middleware.bind(self), PodcastController.updateEpisode.bind(self))
    this.router.delete('/podcasts/:id/episode/:episodeId', PodcastController.middleware.bind(self), PodcastController.removeEpisode.bind(self))

    //
    // Notification Routes (Admin and up)
    //
    this.router.get('/notifications', NotificationController.middleware.bind(self), NotificationController.get.bind(self))
    this.router.patch('/notifications', NotificationController.middleware.bind(self), NotificationController.update.bind(self))
    this.router.get('/notificationdata', NotificationController.middleware.bind(self), NotificationController.getData.bind(self))
    this.router.get('/notifications/test', NotificationController.middleware.bind(self), NotificationController.fireTestEvent.bind(self))
    this.router.post('/notifications', NotificationController.middleware.bind(self), NotificationController.createNotification.bind(self))
    this.router.delete('/notifications/:id', NotificationController.middleware.bind(self), NotificationController.deleteNotification.bind(self))
    this.router.patch('/notifications/:id', NotificationController.middleware.bind(self), NotificationController.updateNotification.bind(self))
    this.router.get('/notifications/:id/test', NotificationController.middleware.bind(self), NotificationController.sendNotificationTest.bind(self))

    //
    // Email Routes (Admin and up)
    //
    this.router.get('/emails/settings', EmailController.adminMiddleware.bind(self), EmailController.getSettings.bind(self))
    this.router.patch('/emails/settings', EmailController.adminMiddleware.bind(self), EmailController.updateSettings.bind(self))
    this.router.post('/emails/test', EmailController.adminMiddleware.bind(self), EmailController.sendTest.bind(self))
    this.router.post('/emails/ereader-devices', EmailController.adminMiddleware.bind(self), EmailController.updateEReaderDevices.bind(self))
    this.router.post('/emails/send-ebook-to-device', EmailController.sendEBookToDevice.bind(self))

    //
    // Search Routes
    //
    this.router.get('/search/covers', SearchController.findCovers.bind(self))
    this.router.get('/search/books', SearchController.findBooks.bind(self))
    this.router.get('/search/podcast', SearchController.findPodcasts.bind(self))
    this.router.get('/search/authors', SearchController.findAuthor.bind(self))
    this.router.get('/search/chapters', SearchController.findChapters.bind(self))
    this.router.get('/search/providers', SearchController.getAllProviders.bind(self))

    //
    // Cache Routes (Admin and up)
    //
    this.router.post('/cache/purge', CacheController.purgeCache.bind(self))
    this.router.post('/cache/items/purge', CacheController.purgeItemsCache.bind(self))

    //
    // Tools Routes (Admin and up)
    //
    this.router.post('/tools/item/:id/encode-m4b', ToolsController.middleware.bind(self), ToolsController.encodeM4b.bind(self))
    this.router.delete('/tools/item/:id/encode-m4b', ToolsController.middleware.bind(self), ToolsController.cancelM4bEncode.bind(self))
    this.router.post('/tools/item/:id/embed-metadata', ToolsController.middleware.bind(self), ToolsController.embedAudioFileMetadata.bind(self))
    this.router.post('/tools/batch/embed-metadata', ToolsController.middleware.bind(self), ToolsController.batchEmbedMetadata.bind(self))

    //
    // RSS Feed Routes (Admin and up)
    //
    this.router.get('/feeds', RSSFeedController.middleware.bind(self), RSSFeedController.getAll.bind(self))
    this.router.post('/feeds/item/:itemId/open', RSSFeedController.middleware.bind(self), RSSFeedController.openRSSFeedForItem.bind(self))
    this.router.post('/feeds/collection/:collectionId/open', RSSFeedController.middleware.bind(self), RSSFeedController.openRSSFeedForCollection.bind(self))
    this.router.post('/feeds/series/:seriesId/open', RSSFeedController.middleware.bind(self), RSSFeedController.openRSSFeedForSeries.bind(self))
    this.router.post('/feeds/:id/close', RSSFeedController.middleware.bind(self), RSSFeedController.closeRSSFeed.bind(self))

    //
    // Custom Metadata Provider routes
    //
    this.router.get('/custom-metadata-providers', CustomMetadataProviderController.middleware.bind(self), CustomMetadataProviderController.getAll.bind(self))
    this.router.post('/custom-metadata-providers', CustomMetadataProviderController.middleware.bind(self), CustomMetadataProviderController.create.bind(self))
    this.router.delete('/custom-metadata-providers/:id', CustomMetadataProviderController.middleware.bind(self), CustomMetadataProviderController.delete.bind(self))

    //
    // Share routes
    //
    this.router.post('/share/mediaitem', ShareController.createMediaItemShare.bind(self))
    this.router.delete('/share/mediaitem/:id', ShareController.deleteMediaItemShare.bind(self))

    //
    // Stats Routes
    //
    this.router.get('/stats/year/:year', StatsController.middleware.bind(self), StatsController.getAdminStatsForYear.bind(self))
    this.router.get('/stats/server', StatsController.middleware.bind(self), StatsController.getServerStats.bind(self))

    //
    // API Key Routes
    //
    this.router.get('/api-keys', ApiKeyController.middleware.bind(self), ApiKeyController.getAll.bind(self))
    this.router.post('/api-keys', ApiKeyController.middleware.bind(self), ApiKeyController.create.bind(self))
    this.router.patch('/api-keys/:id', ApiKeyController.middleware.bind(self), ApiKeyController.update.bind(self))
    this.router.delete('/api-keys/:id', ApiKeyController.middleware.bind(self), ApiKeyController.delete.bind(self))

    //
    // Misc Routes
    //
    this.router.post('/upload', MiscController.handleUpload.bind(self))
    this.router.get('/tasks', MiscController.getTasks.bind(self))
    this.router.patch('/settings', MiscController.updateServerSettings.bind(self))
    this.router.patch('/sorting-prefixes', MiscController.updateSortingPrefixes.bind(self))
    this.router.post('/authorize', MiscController.authorize.bind(self))
    this.router.get('/tags', MiscController.getAllTags.bind(self))
    this.router.post('/tags/rename', MiscController.renameTag.bind(self))
    this.router.delete('/tags/:tag', MiscController.deleteTag.bind(self))
    this.router.get('/genres', MiscController.getAllGenres.bind(self))
    this.router.post('/genres/rename', MiscController.renameGenre.bind(self))
    this.router.delete('/genres/:genre', MiscController.deleteGenre.bind(self))
    this.router.post('/validate-cron', MiscController.validateCronExpression.bind(self))
    this.router.get('/auth-settings', MiscController.getAuthSettings.bind(self))
    this.router.patch('/auth-settings', MiscController.updateAuthSettings.bind(self))
    this.router.post('/watcher/update', MiscController.updateWatchedPath.bind(self))
    this.router.get('/logger-data', MiscController.getLoggerData.bind(self))
  }

  //
  // Helper Methods
  //
  /**
   * Remove library item and associated entities
   * @param libraryItemId
   * @param mediaItemIds array of bookId or podcastEpisodeId
   * @param libraryId
   */
  async handleDeleteLibraryItem(libraryItemId: string, mediaItemIds: string[], libraryId: string): Promise<void> {
    const numProgressRemoved = await (Database.mediaProgressModel as any).destroy({
      where: {
        mediaItemId: mediaItemIds
      }
    })
    if (numProgressRemoved > 0) {
      Logger.info(`[ApiRouter] Removed ${numProgressRemoved} media progress entries for library item "${libraryItemId}"`)
    }

    // remove item from playlists
    await Database.playlistModel.removeMediaItemsFromPlaylists(mediaItemIds)

    // Close rss feed - remove from db and emit socket event
    await RssFeedManager.closeFeedForEntityId(libraryItemId)

    // purge cover cache
    await CacheManager.purgeCoverCache(libraryItemId)

    // Remove metadata file if in /metadata/items dir
    if ((global as any).MetadataPath) {
      const itemMetadataPath = Path.join((global as any).MetadataPath, 'items', libraryItemId)
      if (await fs.pathExists(itemMetadataPath)) {
        Logger.info(`[ApiRouter] Removing item metadata at "${itemMetadataPath}"`)
        await fs.remove(itemMetadataPath)
      }
    }

    await Database.libraryItemModel.removeById(libraryItemId)

    SocketAuthority.emitter('item_removed', {
      id: libraryItemId,
      libraryId
    })
  }

  /**
   * After deleting book(s), remove empty series
   *
   * @param seriesIds
   */
  async checkRemoveEmptySeries(seriesIds: string[]): Promise<void> {
    if (!seriesIds?.length) return

    const transaction = await (Database.sequelize as any).transaction()
    try {
      const seriesToRemove = (
        await (Database.seriesModel as any).findAll({
          where: [
            {
              id: seriesIds
            },
            (sequelize as any).where((sequelize as any).literal('(SELECT count(*) FROM bookSeries bs WHERE bs.seriesId = series.id)'), 0)
          ],
          attributes: ['id', 'name', 'libraryId'],
          include: {
            model: Database.bookModel,
            attributes: ['id'],
            required: false // Ensure it includes series even if no books exist
          },
          transaction
        })
      ).map((s: any) => ({ id: s.id, name: s.name, libraryId: s.libraryId }))

      if (seriesToRemove.length) {
        await (Database.seriesModel as any).destroy({
          where: {
            id: seriesToRemove.map((s: any) => s.id)
          },
          transaction
        })
      }

      await transaction.commit()

      seriesToRemove.forEach(({ id, name, libraryId }: { id: string; name: string; libraryId: string }) => {
        Logger.info(`[ApiRouter] Series "${name}" is now empty. Removing series`)
        // Remove series from library filter data
        Database.removeSeriesFromFilterData(libraryId, id)
        SocketAuthority.emitter('series_removed', { id: id, libraryId: libraryId })
      })
      // Close rss feeds - remove from db and emit socket event
      if (seriesToRemove.length) {
        await RssFeedManager.closeFeedsForEntityIds(seriesToRemove.map((s: any) => s.id))
      }
    } catch (error: any) {
      await transaction.rollback()
      Logger.error(`[ApiRouter] Error removing empty series: ${error.message}`)
    }
  }

  /**
   * Remove authors with no books and unset asin, description and imagePath
   * Note: Other implementation is in BookScanner.checkAuthorsRemovedFromBooks (can be merged)
   *
   * @param authorIds
   */
  async checkRemoveAuthorsWithNoBooks(authorIds: string[]): Promise<void> {
    if (!authorIds?.length) return

    const transaction = await (Database.sequelize as any).transaction()
    try {
      // Select authors with locking to prevent concurrent updates
      const bookAuthorsToRemove = (
        await (Database.authorModel as any).findAll({
          where: [
            {
              id: authorIds,
              asin: {
                [(sequelize.Op as any).or]: [null, '']
              },
              description: {
                [(sequelize.Op as any).or]: [null, '']
              },
              imagePath: {
                [(sequelize.Op as any).or]: [null, '']
              }
            },
            (sequelize as any).where((sequelize as any).literal('(SELECT count(*) FROM bookAuthors ba WHERE ba.authorId = author.id)'), 0)
          ],
          attributes: ['id', 'name', 'libraryId'],
          raw: true,
          transaction
        })
      ).map((au: any) => ({ id: au.id, name: au.name, libraryId: au.libraryId }))

      if (bookAuthorsToRemove.length) {
        await (Database.authorModel as any).destroy({
          where: {
            id: bookAuthorsToRemove.map((au: any) => au.id)
          },
          transaction
        })
      }

      await transaction.commit()

      // Remove all book authors after completing remove from database
      bookAuthorsToRemove.forEach(({ id, name, libraryId }: { id: string; name: string; libraryId: string }) => {
        Database.removeAuthorFromFilterData(libraryId, id)
        // TODO: Clients were expecting full author in payload but its unnecessary
        SocketAuthority.emitter('author_removed', { id, libraryId })
        Logger.info(`[ApiRouter] Removed author "${name}" with no books`)
      })
    } catch (error: any) {
      await transaction.rollback()
      Logger.error(`[ApiRouter] Error removing authors: ${error.message}`)
    }
  }

  async getUserListeningSessionsHelper(userId: string): Promise<any[]> {
    const userSessions = await (Database as any).getPlaybackSessions({ userId })
    return userSessions.sort((a: any, b: any) => b.updatedAt - a.updatedAt)
  }

  async getUserItemListeningSessionsHelper(userId: string, mediaItemId: string): Promise<any[]> {
    const userSessions = await (Database as any).getPlaybackSessions({ userId, mediaItemId })
    return userSessions.sort((a: any, b: any) => b.updatedAt - a.updatedAt)
  }

  async getUserListeningStatsHelpers(userId: string): Promise<any> {
    const today = (date as any).format(new Date(), 'YYYY-MM-DD')

    const listeningSessions = await this.getUserListeningSessionsHelper(userId)
    const listeningStats: Record<string, any> = {
      totalTime: 0,
      items: {},
      days: {},
      dayOfWeek: {},
      today: 0,
      recentSessions: listeningSessions.slice(0, 10)
    }
    listeningSessions.forEach((s: any) => {
      let sessionTimeListening = s.timeListening
      if (typeof sessionTimeListening == 'string') {
        sessionTimeListening = Number(sessionTimeListening)
      }

      if (s.dayOfWeek) {
        if (!listeningStats.dayOfWeek[s.dayOfWeek]) listeningStats.dayOfWeek[s.dayOfWeek] = 0
        listeningStats.dayOfWeek[s.dayOfWeek] += sessionTimeListening
      }
      if (s.date && sessionTimeListening > 0) {
        if (!listeningStats.days[s.date]) listeningStats.days[s.date] = 0
        listeningStats.days[s.date] += sessionTimeListening

        if (s.date === today) {
          listeningStats.today += sessionTimeListening
        }
      }
      if (!listeningStats.items[s.libraryItemId]) {
        listeningStats.items[s.libraryItemId] = {
          id: s.libraryItemId,
          timeListening: sessionTimeListening,
          mediaMetadata: s.mediaMetadata,
          lastUpdate: s.lastUpdate
        }
      } else {
        listeningStats.items[s.libraryItemId].timeListening += sessionTimeListening
      }

      listeningStats.totalTime += sessionTimeListening
    })
    return listeningStats
  }
}

export = ApiRouter
